import bpy
import bmesh
import math
import os
from mathutils import Vector

MODEL_DIR = r"e:\ai\cf-transport-ship-3d\public\models"
TEX_DIR = r"e:\ai\cf-transport-ship-3d\public\textures"
ARTIFACT_DIR = r"C:\Users\10534\.gemini\antigravity\brain\571f5b4e-2e7a-43fa-87c5-5cc78048968e"
os.makedirs(MODEL_DIR, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, color=(0.8, 0.8, 0.8, 1.0), metallic=0.05, roughness=0.55):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name=name)
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None) or nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return m


def make_sheer_pantyhose_mat():
    """Authentic anime sheer dark pantyhose material using Layer Weight Fresnel skin-to-nylon blend (Linear RGB)!"""
    m = bpy.data.materials.new(name="MAT_ANIME_PANTYHOSE")
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.38
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs[6].default_value = (0.065, 0.038, 0.045, 1.0)
    mix.inputs[7].default_value = (0.008, 0.006, 0.012, 1.0)
    nt.links.new(lw.outputs['Facing'], mix.inputs[0])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.42
    bsdf.inputs['Metallic'].default_value = 0.02
    return m


def make_image_mat(name, img_path, bg_color=(0.98, 0.86, 0.83, 1.0), roughness=0.55):
    m = bpy.data.materials.new(name=name)
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.02
    if os.path.exists(img_path):
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(img_path, check_existing=True)
        tex.extension = 'EXTEND'
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = bg_color
    return m


def loft_rings(name, rings, mat, smooth=True, close_caps=True, col=None):
    """rings: list of (cx, cy, cz, rx, ry)"""
    bm = bmesh.new()
    seg = 24
    r_verts = []
    for (cx, cy, cz, rx, ry) in rings:
        rv = []
        for i in range(seg):
            ang = (i / seg) * math.pi * 2
            rv.append(bm.verts.new((cx + math.cos(ang) * rx, cy + math.sin(ang) * ry, cz)))
        r_verts.append(rv)
    for r in range(len(r_verts) - 1):
        r0, r1 = r_verts[r], r_verts[r + 1]
        for i in range(seg):
            ni = (i + 1) % seg
            f = bm.faces.new([r0[i], r0[ni], r1[ni], r1[i]])
            f.smooth = smooth
    if close_caps:
        bm.faces.new(list(reversed(r_verts[0])))
        bm.faces.new(r_verts[-1])
    mesh = bpy.data.meshes.new(name + "_m")
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    (col or bpy.context.collection).objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def add_bezier_hair_strand(name, ctrl_pts, radii, mat, collection=None, bevel_res=6):
    """Creates a smooth tapered 3D Bezier curve hair strand or ribbon."""
    curve_data = bpy.data.curves.new(name + "_c", type='CURVE')
    curve_data.dimensions = '3D'
    curve_data.bevel_depth = 1.0
    curve_data.bevel_resolution = bevel_res
    curve_data.use_fill_caps = True

    spline = curve_data.splines.new('CATMULL_ROM' if hasattr(curve_data.splines, 'CATMULL_ROM') else 'NURBS')
    spline.points.add(len(ctrl_pts) - 1)
    for i, (pt, rad) in enumerate(zip(ctrl_pts, radii)):
        spline.points[i].co = (pt[0], pt[1], pt[2], 1.0)
        spline.points[i].radius = rad
    spline.use_endpoint_u = True

    obj = bpy.data.objects.new(name, curve_data)
    (collection or bpy.context.collection).objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def create_box(name, size, loc, mat, rot=(0, 0, 0), bevel=0.004, subsurf=0, col=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    mesh = bpy.data.meshes.new(name + "_m")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    (col or bpy.context.collection).objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    if subsurf > 0:
        sm = obj.modifiers.new("Sub", 'SUBSURF')
        sm.levels = subsurf
        sm.render_levels = subsurf
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def create_cyl(name, r1, r2, depth, loc, mat, verts=22, rot=(0, 0, 0), scale=(1, 1, 1), col=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r1, radius2=r2, depth=depth)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    mesh = bpy.data.meshes.new(name + "_m")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    (col or bpy.context.collection).objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def build_anime_techwear_girl(col):
    # Linear-space PBR Palette matching the 7-view reference sheet!
    m_skin = make_mat("MAT_ANIME_SKIN", (0.92, 0.72, 0.66, 1.0), 0.0, 0.68)
    m_face = make_image_mat("MAT_ANIME_FACE", os.path.join(TEX_DIR, "anime_face_sym.png"), roughness=0.68)
    m_hair = make_mat("MAT_ANIME_HAIR", (0.016, 0.012, 0.026, 1.0), 0.05, 0.44)
    m_hair_tip = make_mat("MAT_ANIME_HAIR_LAV", (0.065, 0.038, 0.14, 1.0), 0.05, 0.45)
    m_purple = make_mat("MAT_TECH_PURPLE", (0.22, 0.08, 0.68, 1.0), 0.08, 0.45)
    m_lilac = make_mat("MAT_TECH_LILAC", (0.45, 0.26, 0.85, 1.0), 0.06, 0.48)
    m_jacket = make_mat("MAT_TECH_JACKET", (0.014, 0.012, 0.020, 1.0), 0.04, 0.65)
    # Darken anime_back_logo background via Brightness/Contrast so it blends seamlessly with deep black jacket!
    m_back_logo = make_image_mat("MAT_JACKET_BACK", os.path.join(TEX_DIR, "anime_back_logo.png"), (0.014, 0.012, 0.020, 1.0), 0.65)
    nt_bl = m_back_logo.node_tree
    tex_bl = next((n for n in nt_bl.nodes if n.type == 'TEX_IMAGE'), None)
    bsdf_bl = next((n for n in nt_bl.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if tex_bl and bsdf_bl:
        bc = nt_bl.nodes.new('ShaderNodeBrightContrast')
        bc.inputs['Bright'].default_value = -0.14
        bc.inputs['Contrast'].default_value = 0.42
        nt_bl.links.new(tex_bl.outputs['Color'], bc.inputs['Color'])
        nt_bl.links.new(bc.outputs['Color'], bsdf_bl.inputs['Base Color'])

    m_white = make_mat("MAT_TECH_WHITE", (0.86, 0.86, 0.92, 1.0), 0.02, 0.55)
    m_skirt = make_mat("MAT_TECH_SKIRT", (0.016, 0.014, 0.024, 1.0), 0.04, 0.66)
    m_leather = make_mat("MAT_BLACK_LEATHER", (0.010, 0.010, 0.014, 1.0), 0.18, 0.36)
    m_silver = make_mat("MAT_CHROME_RING", (0.82, 0.86, 0.92, 1.0), 0.94, 0.18)
    m_tights = make_sheer_pantyhose_mat()

    # =========================================================================
    # 1. SCULPTED ANIME HEAD + FRONT-PROJECTED AMETHYST EYES/FACE (Z = 1.35..1.55m)
    # =========================================================================
    bm_head = bmesh.new()
    bmesh.ops.create_uvsphere(bm_head, u_segments=32, v_segments=24, radius=0.102)
    for v in bm_head.verts:
        # Anime tapered V-jaw & chin in front (+Y)
        if v.co.z < 0:
            t = -v.co.z / 0.102
            v.co.x *= (1.0 - 0.32 * t)
            v.co.y *= (1.0 - 0.18 * t)
            if v.co.y > 0:
                v.co.y += 0.012 * (1.0 - t)
        v.co.z *= 1.06
    head_m = bpy.data.meshes.new("AnimeHead_m")
    bm_head.normal_update()
    bm_head.to_mesh(head_m)
    bm_head.free()

    head_obj = bpy.data.objects.new("AnimeHead", head_m)
    col.objects.link(head_obj)
    head_obj.location = (0, 0, 1.448)
    head_obj.data.materials.append(m_skin)
    head_obj.data.materials.append(m_face)

    # Planar-project anime_face_sym.png onto the front face polygons (+Y), cropping out the neck/choker bottom 24%!
    head_m.uv_layers.new(name="UVMap")
    uv_h = head_m.uv_layers.active.data
    for poly in head_m.polygons:
        poly.use_smooth = True
        if poly.normal.y > 0.42 and abs(poly.center.x) < 0.078 and -0.078 < poly.center.z < 0.062:
            poly.material_index = 1
            for li in poly.loop_indices:
                co = head_m.vertices[head_m.loops[li].vertex_index].co
                u = 0.5 + (co.x / 0.165)
                w = 0.24 + ((co.z + 0.078) / 0.145) * 0.64
                uv_h[li].uv = (u, w)
        else:
            poly.material_index = 0

    # Neck + Black Leather Choker + Silver O-Ring!
    create_cyl("Neck", 0.036, 0.040, 0.09, (0, -0.008, 1.335), m_skin, verts=20, col=col)
    create_cyl("Choker", 0.039, 0.040, 0.018, (0, -0.008, 1.332), m_leather, verts=24, col=col)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.012, minor_radius=0.0022, major_segments=20, minor_segments=8, location=(0, 0.034, 1.318), rotation=(math.pi / 2, 0, 0))
    oring = bpy.context.active_object
    col.objects.link(oring)
    bpy.context.scene.collection.objects.unlink(oring)
    oring.data.materials.append(m_silver)

    # =========================================================================
    # 2. SCULPTED HAIR DOME, BANGS, AHOGE, 'X' CLIPS & BEZIER TWIN-TAILS + BOWS
    # =========================================================================
    bm_hair = bmesh.new()
    bmesh.ops.create_uvsphere(bm_hair, u_segments=28, v_segments=20, radius=0.110)
    for v in list(bm_hair.verts):
        if v.co.y > 0.035 and v.co.z < 0.025:
            bm_hair.verts.remove(v)
        elif v.co.z < -0.075:
            bm_hair.verts.remove(v)
    hm_mesh = bpy.data.meshes.new("HairCap_m")
    bm_hair.to_mesh(hm_mesh)
    bm_hair.free()
    hcap = bpy.data.objects.new("HairCap", hm_mesh)
    col.objects.link(hcap)
    hcap.location = (0, -0.006, 1.456)
    hcap.data.materials.append(m_hair)
    for p in hcap.data.polygons:
        p.use_smooth = True
    sol = hcap.modifiers.new("Solid", 'SOLIDIFY')
    sol.thickness = 0.012

    # 7 Sculpted Front Bangs + 2 Cheek Sidelocks + Top Ahoge Cowlick
    bang_angles = [-0.068, -0.042, -0.016, 0.010, 0.036, 0.062]
    for idx, bx in enumerate(bang_angles):
        length_z = 0.105 if abs(bx) > 0.04 else 0.088
        add_bezier_hair_strand(
            f"Bang_{idx}",
            [(bx * 0.55, 0.045, 1.545), (bx * 0.92, 0.096, 1.495), (bx * 1.02, 0.102, 1.545 - length_z)],
            [0.012, 0.017, 0.002], m_hair, col
        )
    # Long cheek sidelocks
    for sx in [-1, 1]:
        add_bezier_hair_strand(
            f"Sidelock_{sx}",
            [(sx * 0.075, 0.035, 1.51), (sx * 0.095, 0.055, 1.42), (sx * 0.078, 0.062, 1.33)],
            [0.014, 0.016, 0.002], m_hair, col
        )
    # Cute Top Ahoge
    add_bezier_hair_strand(
        "Ahoge",
        [(0.0, 0.01, 1.555), (0.018, 0.02, 1.595), (-0.015, 0.015, 1.580)],
        [0.006, 0.007, 0.001], m_hair, col
    )
    # Lavender 'X' Hairpins on right bangs (-X is character's right from viewer's left!)
    for (hx, hy, hz) in [(-0.056, 0.096, 1.505), (-0.072, 0.082, 1.468)]:
        for r_ang in [0.72, -0.72]:
            create_box(f"XClip_{hx}_{r_ang}", (0.024, 0.004, 0.005), (hx, hy, hz), m_lilac, rot=(0, r_ang, math.radians(24)), bevel=0.001, col=col)

    # Flowing Multi-Strand Bezier Twin-Tails + Sculpted Purple Ribbon Bows!
    for sx in [-1, 1]:
        knot_x, knot_y, knot_z = sx * 0.112, -0.025, 1.505
        # 5 lush flowing strands per twin-tail
        offsets = [(0, 0), (sx * 0.022, -0.015), (-sx * 0.015, -0.022), (sx * 0.018, 0.018), (0, -0.03)]
        for si, (ox, oy) in enumerate(offsets):
            add_bezier_hair_strand(
                f"TwinTail_{sx}_{si}",
                [
                    (knot_x, knot_y, knot_z),
                    (sx * 0.165 + ox, -0.045 + oy, 1.43),
                    (sx * 0.205 + ox * 1.3, -0.055 + oy, 1.24),
                    (sx * 0.225 + ox * 1.5, -0.035 + oy, 1.06),
                    (sx * 0.195 + ox, 0.005 + oy, 0.95 + si * 0.015),
                ],
                [0.022, 0.032, 0.028, 0.018, 0.002],
                m_hair_tip if si >= 3 else m_hair, col
            )
        # Double-Loop Purple Ribbon Bow + Trailing Tails
        for loop_s in [-1, 1]:
            create_box(
                f"BowLoop_{sx}_{loop_s}", (0.055, 0.022, 0.034),
                (knot_x + sx * 0.015, knot_y + loop_s * 0.024, knot_z + 0.025),
                m_purple, rot=(loop_s * 0.45, sx * -0.35, 0.3), bevel=0.006, subsurf=1, col=col
            )
        for tail_s in [-1, 1]:
            add_bezier_hair_strand(
                f"BowTail_{sx}_{tail_s}",
                [(knot_x + sx * 0.01, knot_y, knot_z + 0.01), (knot_x + sx * 0.055, knot_y + tail_s * 0.035, knot_z - 0.08)],
                [0.010, 0.004], m_lilac, col
            )

    # =========================================================================
    # 3. CROPPED WHITE SAILOR TOP + PURPLE TIE + BARE MIDRIFF (Z = 0.96..1.30m)
    # =========================================================================
    loft_rings("MidriffTorso", [
        (0, 0, 0.94, 0.095, 0.068),
        (0, 0, 1.00, 0.082, 0.060),
        (0, 0, 1.05, 0.086, 0.064),
    ], m_skin, col=col)

    loft_rings("CroppedWhiteTop", [
        (0, 0, 1.045, 0.090, 0.068),
        (0, 0.012, 1.15, 0.108, 0.086),
        (0, 0.005, 1.25, 0.102, 0.075),
        (0, 0, 1.30, 0.068, 0.055),
    ], m_white, col=col)
    # Ribbed dark hem under bust + Sailor V-collar + Short Purple Tie!
    create_cyl("TopRibHem", 0.091, 0.088, 0.026, (0, 0.002, 1.052), m_jacket, verts=24, scale=(1.0, 0.76, 1), col=col)
    create_box("TieKnot", (0.026, 0.018, 0.024), (0, 0.076, 1.225), m_purple, bevel=0.005, col=col)
    create_box("TieBlade", (0.032, 0.012, 0.125), (0, 0.086, 1.145), m_purple, rot=(math.radians(-6), 0, 0), bevel=0.004, col=col)

    # =========================================================================
    # 4. OVERSIZED BLACK & PURPLE HOODED TECHWEAR JACKET + BACK SWIRL EMBLEM!
    # =========================================================================
    # Open-front oversized jacket body shell (wraps back & flanks, leaving front open to show cropped top & tie!)
    bm_j = bmesh.new()
    j_rings = [
        (0.84, 0.168, 0.125),
        (0.94, 0.175, 0.132),
        (1.08, 0.162, 0.122),
        (1.22, 0.148, 0.108),
        (1.30, 0.115, 0.088),
    ]
    arc_steps = 22
    jr_verts = []
    for (jz, rx, ry) in j_rings:
        row = []
        # Angle from +62 deg (front-right lapel) around back (-90 deg) to +118 deg (front-left lapel)
        # Wait: +Y is front (90 deg), -Y is back (-90 / 270 deg). Open gap in front is [56 deg .. 124 deg]!
        for s_i in range(arc_steps + 1):
            ang = math.radians(124 + (s_i / arc_steps) * 292)
            row.append(bm_j.verts.new((math.cos(ang) * rx, math.sin(ang) * ry, jz)))
        jr_verts.append(row)
    for r in range(len(jr_verts) - 1):
        for i in range(arc_steps):
            f = bm_j.faces.new([jr_verts[r][i], jr_verts[r][i + 1], jr_verts[r + 1][i + 1], jr_verts[r + 1][i]])
            f.smooth = True

    jm = bpy.data.meshes.new("JacketBody_m")
    bm_j.normal_update()
    bm_j.to_mesh(jm)
    bm_j.free()
    j_obj = bpy.data.objects.new("JacketBody", jm)
    col.objects.link(j_obj)
    j_obj.data.materials.append(m_jacket)
    j_obj.data.materials.append(m_back_logo)

    # Planar-map anime_back_logo.png onto the center back of the hoodie (-Y)!
    jm.uv_layers.new(name="UVMap")
    uv_j = jm.uv_layers.active.data
    for poly in jm.polygons:
        if poly.normal.y < -0.55 and abs(poly.center.x) < 0.115 and 0.96 < poly.center.z < 1.22:
            poly.material_index = 1
            for li in poly.loop_indices:
                co = jm.vertices[jm.loops[li].vertex_index].co
                u = (-co.x / 0.22) + 0.5
                w = (co.z - 0.96) / 0.25
                uv_j[li].uv = (u, w)
        else:
            poly.material_index = 0

    sol_j = j_obj.modifiers.new("SolidJ", 'SOLIDIFY')
    sol_j.thickness = 0.014
    sub_j = j_obj.modifiers.new("SubJ", 'SUBSURF')
    sub_j.levels = 1
    sub_j.render_levels = 1

    # Open-Front White-Lined Techwear Hood draped around back & shoulders (open in front so choker & tie show!)
    add_bezier_hair_strand(
        "OpenHoodCollar",
        [(0.095, 0.065, 1.245), (0.135, -0.015, 1.285), (0.0, -0.105, 1.285), (-0.135, -0.015, 1.285), (-0.095, 0.065, 1.245)],
        [0.022, 0.036, 0.042, 0.036, 0.022], m_white, col
    )

    # Purple Pocket Flaps on Front/Back Jacket
    for sx in [-1, 1]:
        create_box(f"PocketFlap_{sx}", (0.022, 0.085, 0.042), (sx * 0.155, 0.045, 0.935), m_lilac, rot=(math.radians(22), 0, sx * math.radians(-14)), bevel=0.004, col=col)

    # Billowy Oversized Techwear Sleeves + Ribbed Cuffs + Cute Anime Hands!
    for sx in [-1, 1]:
        s_rings = [
            (sx * 0.125, -0.005, 1.255, 0.055, 0.055),
            (sx * 0.175, -0.005, 1.165, 0.072, 0.068),
            (sx * 0.225,  0.005, 1.045, 0.088, 0.082),
            (sx * 0.255,  0.015, 0.945, 0.095, 0.088),
            (sx * 0.248,  0.020, 0.895, 0.048, 0.046),
        ]
        loft_rings(f"Sleeve_{sx}", s_rings, m_jacket, col=col)
        # Purple accent stripe along outer sleeve
        add_bezier_hair_strand(
            f"SleeveStripe_{sx}",
            [(sx * 0.18, 0.01, 1.21), (sx * 0.26, 0.02, 1.07), (sx * 0.295, 0.03, 0.94)],
            [0.008, 0.010, 0.008], m_purple, col
        )
        # Tight ribbed cuff + Cute stylized anime hand
        create_cyl(f"Cuff_{sx}", 0.044, 0.048, 0.042, (sx * 0.248, 0.022, 0.880), m_leather, verts=20, rot=(0, sx * math.radians(-14), 0), col=col)
        create_box(f"Hand_{sx}", (0.032, 0.042, 0.048), (sx * 0.255, 0.026, 0.842), m_skin, bevel=0.010, subsurf=1, col=col)

    # =========================================================================
    # 5. 20-PLEAT MINI-SKIRT + BELT + ID CARD + PURPLE CROSSBODY BAG (Z = 0.77..0.98m)
    # =========================================================================
    bm_sk = bmesh.new()
    pleats = 22
    top_v, bot_v, hem_v = [], [], []
    for i in range(pleats * 2):
        ang = (i / (pleats * 2)) * math.pi * 2
        saw = 1.0 if i % 2 == 0 else 0.91
        top_v.append(bm_sk.verts.new((math.cos(ang) * 0.098 * saw, math.sin(ang) * 0.076 * saw, 0.975)))
        bot_v.append(bm_sk.verts.new((math.cos(ang) * 0.168 * saw, math.sin(ang) * 0.134 * saw, 0.805)))
        hem_v.append(bm_sk.verts.new((math.cos(ang) * 0.176 * saw, math.sin(ang) * 0.140 * saw, 0.778)))
    n_v = len(top_v)
    for i in range(n_v):
        ni = (i + 1) % n_v
        f1 = bm_sk.faces.new([bot_v[i], bot_v[ni], top_v[ni], top_v[i]])
        f1.material_index = 0
        f2 = bm_sk.faces.new([hem_v[i], hem_v[ni], bot_v[ni], bot_v[i]])
        f2.material_index = 1
    sk_m = bpy.data.meshes.new("PleatedSkirt_m")
    bm_sk.normal_update()
    bm_sk.to_mesh(sk_m)
    bm_sk.free()
    sk_obj = bpy.data.objects.new("PleatedSkirt", sk_m)
    col.objects.link(sk_obj)
    sk_obj.data.materials.append(m_skirt)
    sk_obj.data.materials.append(m_white)
    sol_sk = sk_obj.modifiers.new("SolidSk", 'SOLIDIFY')
    sol_sk.thickness = 0.006

    # Tactical Waist Belt + Silver Buckle + Hanging Purple ID Pass + Crossbody Purple Bag!
    create_cyl("SkirtBelt", 0.105, 0.108, 0.028, (0, 0, 0.955), m_leather, verts=26, scale=(1.04, 0.80, 1), col=col)
    create_box("BeltBuckle", (0.032, 0.012, 0.032), (0.015, 0.086, 0.955), m_silver, bevel=0.003, col=col)
    create_box("PurpleIDCard", (0.036, 0.006, 0.048), (0.068, 0.092, 0.900), m_purple, rot=(math.radians(-10), 0, math.radians(-8)), bevel=0.003, col=col)
    create_box("CrossbodyBag", (0.048, 0.088, 0.092), (-0.175, 0.035, 0.735), m_purple, rot=(0, math.radians(8), math.radians(12)), bevel=0.014, subsurf=1, col=col)
    add_bezier_hair_strand(
        "BagStrap",
        [(-0.175, 0.015, 0.78), (-0.165, 0.05, 0.90), (-0.06, 0.095, 1.08), (0.08, 0.06, 1.28)],
        [0.005, 0.005, 0.005, 0.005], m_purple, col
    )

    # =========================================================================
    # 6. SHEER PANTYHOSE ANIME LEGS + LEFT-THIGH GARTER STRAP (Z = 0.14..0.80m)
    # =========================================================================
    for sx in [-1, 1]:
        lx = sx * 0.068
        leg_rings = [
            (lx * 1.08, 0.000, 0.13, 0.030, 0.032),
            (lx * 1.06, -0.006, 0.24, 0.038, 0.042),
            (lx * 1.04, -0.012, 0.36, 0.048, 0.052),
            (lx * 1.00,  0.004, 0.48, 0.044, 0.046),
            (lx * 0.98,  0.006, 0.62, 0.056, 0.060),
            (lx * 0.95,  0.002, 0.76, 0.066, 0.070),
            (lx * 0.92,  0.000, 0.83, 0.068, 0.072),
        ]
        loft_rings(f"SheerLeg_{sx}", leg_rings, m_tights, col=col)

    # Left-Thigh (+X) Black Garter Strap + Silver Buckle!
    create_cyl("ThighGarter", 0.061, 0.060, 0.022, (0.066, 0.004, 0.685), m_leather, verts=24, scale=(0.98, 1.04, 1), col=col)
    create_box("GarterBuckle", (0.018, 0.010, 0.025), (0.066, 0.064, 0.685), m_silver, bevel=0.002, col=col)

    # =========================================================================
    # 7. CHUNKY BLACK-WHITE-PURPLE PLATFORM TECHWEAR SNEAKERS (Z = 0.00..0.16m)
    # =========================================================================
    for sx in [-1, 1]:
        fx = sx * 0.074
        # Purple Lugged Outsole (bottom tread Z = 0.00..0.022)
        create_box(f"ShoeOutsole_{sx}", (0.096, 0.215, 0.022), (fx, 0.035, 0.011), m_purple, rot=(0, 0, sx * math.radians(-4)), bevel=0.008, subsurf=1, col=col)
        # Chunky Wavy White Midsole (Z = 0.020..0.058)
        create_box(f"ShoeMidsole_{sx}", (0.094, 0.210, 0.040), (fx, 0.034, 0.040), m_white, rot=(0, 0, sx * math.radians(-4)), bevel=0.012, subsurf=1, col=col)
        # Black & White Sneaker Upper + Tongue + Laces (Z = 0.055..0.145)
        create_box(f"ShoeUpper_{sx}", (0.082, 0.175, 0.072), (fx, 0.026, 0.090), m_leather, rot=(0, 0, sx * math.radians(-4)), bevel=0.016, subsurf=1, col=col)
        create_box(f"ShoeToeWhite_{sx}", (0.076, 0.065, 0.036), (fx, 0.092, 0.072), m_white, rot=(0, 0, sx * math.radians(-4)), bevel=0.012, subsurf=1, col=col)
        create_cyl(f"ShoeCollar_{sx}", 0.040, 0.044, 0.048, (fx, -0.008, 0.132), m_leather, verts=20, col=col)
        create_box(f"ShoeTongue_{sx}", (0.044, 0.018, 0.052), (fx, 0.035, 0.135), m_leather, rot=(math.radians(-22), 0, 0), bevel=0.006, col=col)
        create_box(f"TongueTag_{sx}", (0.018, 0.006, 0.016), (fx, 0.044, 0.142), m_lilac, rot=(math.radians(-22), 0, 0), bevel=0.002, col=col)
        for li in range(3):
            create_box(f"Lace_{sx}_{li}", (0.048, 0.010, 0.006), (fx, 0.052 + li * 0.018, 0.118 - li * 0.012), m_white, rot=(0, 0, sx * math.radians(-4)), bevel=0.002, col=col)


def main():
    reset_scene()

    # 1. Build Master Collection of the Anime Girl at Origin & Export Standalone GLB!
    master_col = bpy.data.collections.new("MasterGirl")
    bpy.context.scene.collection.children.link(master_col)
    build_anime_techwear_girl(master_col)

    glb_path = os.path.join(MODEL_DIR, "anime_techwear_girl.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
    )
    print(f"Exported Anime Girl GLB: {glb_path} ({os.path.getsize(glb_path)} bytes)")

    # 2. Instance Left (3/4 View), Center (Front View), Right (Back View) for Cycles 3-Angle Turnaround Render!
    # Unlink master collection from scene root (leaving hide_render=False so collection instances render!)
    bpy.context.scene.collection.children.unlink(master_col)
    for name, x_pos, yaw_deg in [
        ("Inst_Front", -0.68, 0),
        ("Inst_ThreeQuarter", 0.0, -34),
        ("Inst_Back", 0.68, 180),
    ]:
        inst = bpy.data.objects.new(name, None)
        inst.instance_type = 'COLLECTION'
        inst.instance_collection = master_col
        inst.location = (x_pos, 0, 0)
        inst.rotation_euler = (0, 0, math.radians(yaw_deg))
        bpy.context.scene.collection.objects.link(inst)

    # Clean light-lavender studio cyclorama floor
    floor_mat = make_mat("StudioFloor", (0.92, 0.91, 0.96, 1.0), 0.05, 0.35)
    create_cyl("TurntableFloor", 3.5, 3.5, 0.04, (0, 0, -0.02), floor_mat, verts=64)

    # Studio Anime Lighting + Cycles Render
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 920
    scene.render.image_settings.file_format = 'PNG'

    world = bpy.data.worlds.new("AnimeStudio")
    scene.world = world
    bg = world.node_tree.nodes.get("Background") or world.node_tree.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.52, 0.50, 0.58, 1.0)
    bg.inputs[1].default_value = 0.55

    def add_light(nm, loc, tgt, energy, sz, col_rgb):
        ld = bpy.data.lights.new(nm, 'AREA')
        ld.energy = energy
        ld.size = sz
        ld.color = col_rgb
        lo = bpy.data.objects.new(nm, ld)
        scene.collection.objects.link(lo)
        lo.location = Vector(loc)
        lo.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

    add_light("Key", (1.6, 3.4, 2.1), (0, 0, 0.9), 145, 3.0, (1.0, 0.98, 0.99))
    add_light("Fill", (-1.8, 3.2, 1.5), (0, 0, 0.9), 85, 3.2, (0.92, 0.90, 1.0))
    add_light("Rim", (0.0, -2.6, 2.3), (0, 0, 1.1), 135, 2.6, (0.78, 0.62, 1.0))

    cam_d = bpy.data.cameras.new("TurnaroundCam")
    cam_d.lens = 45
    cam_o = bpy.data.objects.new("TurnaroundCam", cam_d)
    scene.collection.objects.link(cam_o)
    cam_o.location = Vector((0.0, 3.85, 0.92))
    cam_o.rotation_euler = (Vector((0, 0, 0.80)) - cam_o.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam_o

    out_png = os.path.join(ARTIFACT_DIR, "anime_girl_3d_turnaround.png")
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    print(f"Saved Anime Girl 3D Turnaround Render: {out_png}")


if __name__ == "__main__":
    main()
