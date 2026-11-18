import bpy
import bmesh
import math
import os

MODEL_DIR = r"e:\ai\cf-transport-ship-3d\public\models"
TEX_DIR = r"e:\ai\cf-transport-ship-3d\public\textures"
os.makedirs(MODEL_DIR, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, color=(0.8, 0.8, 0.8, 1.0), metallic=0.05, roughness=0.55, emission=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name=name)
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None) or nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission is not None and 'Emission Color' in bsdf.inputs:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = 2.8
    return m


def box_uv(obj, scale=2.0):
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_l = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            v = mesh.vertices[mesh.loops[li].vertex_index].co
            if ax >= ay and ax >= az:
                u, w = v.y * scale, v.z * scale
            elif ay >= ax and ay >= az:
                u, w = v.x * scale, v.z * scale
            else:
                u, w = v.x * scale, v.y * scale
            uv_l[li].uv = (u, w)


def loft_rings_part(name, rings, mat, smooth=True, close_caps=True):
    bm = bmesh.new()
    seg = 20
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
            f = bm.faces.new([r0[i], r0[ni], r1[ni], r0[i] if False else r1[i]])
            f.smooth = smooth
    if close_caps:
        bm.faces.new(list(reversed(r_verts[0])))
        bm.faces.new(r_verts[-1])
    mesh = bpy.data.meshes.new(name + "_m")
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    box_uv(obj)
    return obj


def bezier_strand_part(name, ctrl_pts, radii, mat, bevel_res=5):
    curve_data = bpy.data.curves.new(name + "_c", type='CURVE')
    curve_data.dimensions = '3D'
    curve_data.bevel_depth = 1.0
    curve_data.bevel_resolution = bevel_res
    curve_data.use_fill_caps = True
    spline = curve_data.splines.new('NURBS')
    spline.points.add(len(ctrl_pts) - 1)
    for i, (pt, rad) in enumerate(zip(ctrl_pts, radii)):
        spline.points[i].co = (pt[0], pt[1], pt[2], 1.0)
        spline.points[i].radius = rad
    spline.use_endpoint_u = True
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def box_part(name, size, loc, mat, rot=(0, 0, 0), bevel=0.004, subsurf=0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    mesh = bpy.data.meshes.new(name + "_m")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    box_uv(obj)
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


def cyl_part(name, r1, r2, depth, loc, mat, verts=18, rot=(0, 0, 0), scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r1, radius2=r2, depth=depth)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    mesh = bpy.data.meshes.new(name + "_m")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    box_uv(obj)
    return obj


def join_into_mesh(root_name, parts):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    combined_bm = bmesh.new()
    uv_layer = combined_bm.loops.layers.uv.new("UVMap")
    mat_list = []
    mat_map = {}

    for obj in parts:
        eval_obj = obj.evaluated_get(depsgraph)
        tm = bpy.data.meshes.new_from_object(eval_obj)
        tm.transform(obj.matrix_world)

        local_map = {}
        for idx, m in enumerate(tm.materials):
            if m.name not in mat_map:
                mat_map[m.name] = len(mat_list)
                mat_list.append(m)
            local_map[idx] = mat_map[m.name]

        off = len(combined_bm.verts)
        for v in tm.vertices:
            combined_bm.verts.new(v.co)
        combined_bm.verts.ensure_lookup_table()

        src_uv = tm.uv_layers.active.data if tm.uv_layers.active else None
        for poly in tm.polygons:
            p_verts = [combined_bm.verts[off + vi] for vi in poly.vertices]
            try:
                f = combined_bm.faces.new(p_verts)
                f.smooth = poly.use_smooth
                f.material_index = local_map.get(poly.material_index, 0)
                if src_uv:
                    for li, loop in enumerate(f.loops):
                        sc = src_uv[poly.loop_indices[li]].uv
                        loop[uv_layer].uv = (sc.x, sc.y)
            except ValueError:
                pass
        bpy.data.meshes.remove(tm)

    for obj in parts:
        bpy.data.objects.remove(obj, do_unlink=True)

    final_mesh = bpy.data.meshes.new(root_name + "_mesh")
    combined_bm.normal_update()
    combined_bm.to_mesh(final_mesh)
    combined_bm.free()
    for m in mat_list:
        final_mesh.materials.append(m)

    final_obj = bpy.data.objects.new(root_name, final_mesh)
    bpy.context.collection.objects.link(final_obj)
    return final_obj


def build_rigged_anime_hero():
    reset_scene()
    S = 1.07  # Scale 1.58m -> ~1.69m tactical competitive hitbox height!

    m_skin = make_mat("MAT_HERO_SKIN", (0.94, 0.78, 0.73, 1.0), 0.0, 0.65)
    m_face = make_mat("MAT_HERO_FACE", (1.0, 1.0, 1.0, 1.0), 0.0, 0.65)
    m_hair = make_mat("MAT_HERO_HAIR", (0.045, 0.035, 0.068, 1.0), 0.06, 0.42)
    m_hair_tip = make_mat("MAT_HERO_HAIR_LAV", (0.16, 0.10, 0.28, 1.0), 0.06, 0.44)
    m_purple = make_mat("MAT_HERO_PURPLE", (0.38, 0.18, 0.82, 1.0), 0.10, 0.42)
    m_lilac = make_mat("MAT_HERO_LILAC", (0.62, 0.42, 0.94, 1.0), 0.08, 0.45)
    m_jacket = make_mat("MAT_HERO_JACKET", (0.042, 0.038, 0.056, 1.0), 0.06, 0.62)
    m_back_logo = make_mat("MAT_HERO_BACKLOGO", (1.0, 1.0, 1.0, 1.0), 0.04, 0.58)
    m_white = make_mat("MAT_HERO_WHITE", (0.92, 0.92, 0.96, 1.0), 0.02, 0.52)
    m_skirt = make_mat("MAT_HERO_SKIRT", (0.05, 0.044, 0.068, 1.0), 0.05, 0.64)
    m_leather = make_mat("MAT_HERO_LEATHER", (0.03, 0.03, 0.04, 1.0), 0.22, 0.35)
    m_silver = make_mat("MAT_HERO_SILVER", (0.85, 0.88, 0.93, 1.0), 0.94, 0.18)
    m_tights = make_mat("MAT_HERO_TIGHTS", (0.09, 0.068, 0.085, 1.0), 0.06, 0.44)
    m_glow = make_mat("MAT_HERO_GLOW", (0.65, 0.32, 1.0, 1.0), 0.2, 0.2, emission=(0.62, 0.28, 1.0))

    # =========================================================================
    # 1. HERO_Torso (Origin at 0,0,0 feet level; spans Z_b = 0.82..1.40m)
    # =========================================================================
    t_parts = []
    t_parts.append(loft_rings_part("Midriff", [
        (0, 0, 0.98 * S, 0.102, 0.074),
        (0, 0, 1.04 * S, 0.088, 0.064),
        (0, 0, 1.09 * S, 0.092, 0.068),
    ], m_skin))
    t_parts.append(loft_rings_part("WhiteTop", [
        (0, 0, 1.085 * S, 0.096, 0.074),
        (0, 0.014, 1.19 * S, 0.116, 0.092),
        (0, 0.006, 1.29 * S, 0.108, 0.080),
        (0, 0, 1.34 * S, 0.072, 0.058),
    ], m_white))
    t_parts.append(cyl_part("TopHem", 0.098, 0.094, 0.028, (0, 0.002, 1.09 * S), m_jacket, scale=(1.0, 0.78, 1)))
    t_parts.append(box_part("TieKnot", (0.028, 0.018, 0.026), (0, 0.082, 1.26 * S), m_purple, bevel=0.005))
    t_parts.append(box_part("TieBlade", (0.034, 0.012, 0.13), (0, 0.092, 1.18 * S), m_purple, rot=(math.radians(-6), 0, 0), bevel=0.004))

    # Open-front Oversized Jacket Shell + Planar Back Swirl Logo UV!
    bm_j = bmesh.new()
    j_rings = [
        (0.88 * S, 0.178, 0.134),
        (0.98 * S, 0.186, 0.140),
        (1.12 * S, 0.172, 0.130),
        (1.26 * S, 0.156, 0.114),
        (1.34 * S, 0.122, 0.092),
    ]
    arc_steps = 20
    jr_verts = []
    for (jz, rx, ry) in j_rings:
        row = []
        for s_i in range(arc_steps + 1):
            ang = math.radians(124 + (s_i / arc_steps) * 292)
            row.append(bm_j.verts.new((math.cos(ang) * rx, math.sin(ang) * ry, jz)))
        jr_verts.append(row)
    for r in range(len(jr_verts) - 1):
        for i in range(arc_steps):
            f = bm_j.faces.new([jr_verts[r][i], jr_verts[r][i + 1], jr_verts[r + 1][i + 1], jr_verts[r + 1][i]])
            f.smooth = True
    jm = bpy.data.meshes.new("JacketShell_m")
    bm_j.normal_update()
    bm_j.to_mesh(jm)
    bm_j.free()
    j_obj = bpy.data.objects.new("JacketShell", jm)
    bpy.context.collection.objects.link(j_obj)
    j_obj.data.materials.append(m_jacket)
    j_obj.data.materials.append(m_back_logo)
    jm.uv_layers.new(name="UVMap")
    uv_j = jm.uv_layers.active.data
    for poly in jm.polygons:
        if poly.normal.y < -0.55 and abs(poly.center.x) < 0.125 and 1.00 * S < poly.center.z < 1.26 * S:
            poly.material_index = 1
            for li in poly.loop_indices:
                co = jm.vertices[jm.loops[li].vertex_index].co
                uv_j[li].uv = ((-co.x / 0.24) + 0.5, (co.z - 1.00 * S) / (0.26 * S))
        else:
            poly.material_index = 0
    sol_j = j_obj.modifiers.new("SolidJ", 'SOLIDIFY')
    sol_j.thickness = 0.015
    t_parts.append(j_obj)

    t_parts.append(bezier_strand_part(
        "HoodCollar",
        [(0.10, 0.068, 1.28 * S), (0.145, -0.015, 1.32 * S), (0.0, -0.112, 1.32 * S), (-0.145, -0.015, 1.32 * S), (-0.10, 0.068, 1.28 * S)],
        [0.024, 0.038, 0.044, 0.038, 0.024], m_white
    ))
    for sx in [-1, 1]:
        t_parts.append(box_part(f"PocketFlap_{sx}", (0.022, 0.088, 0.044), (sx * 0.165, 0.045, 0.97 * S), m_lilac, rot=(math.radians(22), 0, sx * math.radians(-14)), bevel=0.004))

    # 22-Pleat Mini-Skirt + Belt + ID Card + Crossbody Purple Bag
    bm_sk = bmesh.new()
    pleats = 20
    top_v, bot_v, hem_v = [], [], []
    for i in range(pleats * 2):
        ang = (i / (pleats * 2)) * math.pi * 2
        saw = 1.0 if i % 2 == 0 else 0.91
        top_v.append(bm_sk.verts.new((math.cos(ang) * 0.105 * saw, math.sin(ang) * 0.082 * saw, 1.01 * S)))
        bot_v.append(bm_sk.verts.new((math.cos(ang) * 0.178 * saw, math.sin(ang) * 0.142 * saw, 0.835 * S)))
        hem_v.append(bm_sk.verts.new((math.cos(ang) * 0.186 * saw, math.sin(ang) * 0.148 * saw, 0.808 * S)))
    n_v = len(top_v)
    for i in range(n_v):
        ni = (i + 1) % n_v
        f1 = bm_sk.faces.new([bot_v[i], bot_v[ni], top_v[ni], top_v[i]])
        f1.material_index = 0
        f2 = bm_sk.faces.new([hem_v[i], hem_v[ni], bot_v[ni], bot_v[i]])
        f2.material_index = 1
    sk_m = bpy.data.meshes.new("HeroSkirt_m")
    bm_sk.normal_update()
    bm_sk.to_mesh(sk_m)
    bm_sk.free()
    sk_obj = bpy.data.objects.new("HeroSkirt", sk_m)
    bpy.context.collection.objects.link(sk_obj)
    sk_obj.data.materials.append(m_skirt)
    sk_obj.data.materials.append(m_white)
    box_uv(sk_obj)
    t_parts.append(sk_obj)

    t_parts.append(cyl_part("SkirtBelt", 0.112, 0.115, 0.030, (0, 0, 0.99 * S), m_leather, scale=(1.04, 0.80, 1)))
    t_parts.append(box_part("BeltBuckle", (0.034, 0.012, 0.034), (0.015, 0.092, 0.99 * S), m_silver, bevel=0.003))
    t_parts.append(box_part("PurpleID", (0.038, 0.006, 0.050), (0.072, 0.098, 0.935 * S), m_purple, rot=(math.radians(-10), 0, math.radians(-8)), bevel=0.003))
    t_parts.append(box_part("CrossBag", (0.050, 0.092, 0.096), (-0.185, 0.035, 0.78 * S), m_purple, rot=(0, math.radians(8), math.radians(12)), bevel=0.014, subsurf=1))
    join_into_mesh("HERO_Torso", t_parts)

    # =========================================================================
    # 2. HERO_Head (Origin at Neck Pivot 0,0,0 -> mounted at Y_three = 1.43m!)
    # =========================================================================
    h_parts = []
    h_parts.append(cyl_part("Neck", 0.038, 0.042, 0.095, (0, -0.008, 0.02), m_skin))
    h_parts.append(cyl_part("Choker", 0.041, 0.042, 0.018, (0, -0.008, 0.018), m_leather))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.013, minor_radius=0.0025, major_segments=18, minor_segments=8, location=(0, 0.036, 0.004), rotation=(math.pi / 2, 0, 0))
    oring = bpy.context.active_object
    oring.data.materials.append(m_silver)
    box_uv(oring)
    h_parts.append(oring)

    bm_head = bmesh.new()
    bmesh.ops.create_uvsphere(bm_head, u_segments=28, v_segments=20, radius=0.108)
    for v in bm_head.verts:
        if v.co.z < 0:
            t = -v.co.z / 0.108
            v.co.x *= (1.0 - 0.32 * t)
            v.co.y *= (1.0 - 0.18 * t)
            if v.co.y > 0:
                v.co.y += 0.012 * (1.0 - t)
        v.co.z *= 1.06
    head_m = bpy.data.meshes.new("HeroHead_m")
    bm_head.normal_update()
    bm_head.to_mesh(head_m)
    bm_head.free()
    head_o = bpy.data.objects.new("HeroHead", head_m)
    bpy.context.collection.objects.link(head_o)
    head_o.location = (0, 0, 0.135)
    head_o.data.materials.append(m_skin)
    head_o.data.materials.append(m_face)
    head_m.uv_layers.new(name="UVMap")
    uv_h = head_m.uv_layers.active.data
    for poly in head_m.polygons:
        poly.use_smooth = True
        if poly.normal.y > 0.42 and abs(poly.center.x) < 0.082 and -0.082 < poly.center.z < 0.066:
            poly.material_index = 1
            for li in poly.loop_indices:
                co = head_m.vertices[head_m.loops[li].vertex_index].co
                u = 0.5 + (co.x / 0.172)
                w = 0.24 + ((co.z + 0.082) / 0.152) * 0.64
                uv_h[li].uv = (u, w)
        else:
            poly.material_index = 0
    h_parts.append(head_o)

    bm_hair = bmesh.new()
    bmesh.ops.create_uvsphere(bm_hair, u_segments=24, v_segments=18, radius=0.116)
    for v in list(bm_hair.verts):
        if v.co.y > 0.038 and v.co.z < 0.026:
            bm_hair.verts.remove(v)
        elif v.co.z < -0.08:
            bm_hair.verts.remove(v)
    hm_mesh = bpy.data.meshes.new("HeroHairCap_m")
    bm_hair.to_mesh(hm_mesh)
    bm_hair.free()
    hcap = bpy.data.objects.new("HeroHairCap", hm_mesh)
    bpy.context.collection.objects.link(hcap)
    hcap.location = (0, -0.006, 0.142)
    hcap.data.materials.append(m_hair)
    for p in hcap.data.polygons:
        p.use_smooth = True
    sol = hcap.modifiers.new("Solid", 'SOLIDIFY')
    sol.thickness = 0.012
    box_uv(hcap)
    h_parts.append(hcap)

    for idx, bx in enumerate([-0.070, -0.044, -0.016, 0.012, 0.038, 0.066]):
        lz = 0.110 if abs(bx) > 0.04 else 0.092
        h_parts.append(bezier_strand_part(
            f"HBang_{idx}",
            [(bx * 0.55, 0.048, 0.235), (bx * 0.94, 0.102, 0.185), (bx * 1.04, 0.108, 0.235 - lz)],
            [0.013, 0.018, 0.002], m_hair
        ))
    for sx in [-1, 1]:
        h_parts.append(bezier_strand_part(
            f"HSidelock_{sx}",
            [(sx * 0.080, 0.038, 0.20), (sx * 0.10, 0.058, 0.105), (sx * 0.082, 0.065, 0.015)],
            [0.015, 0.017, 0.002], m_hair
        ))
    h_parts.append(bezier_strand_part("HAhoge", [(0.0, 0.01, 0.245), (0.02, 0.02, 0.29), (-0.016, 0.015, 0.275)], [0.006, 0.007, 0.001], m_hair))
    for (hx, hy, hz) in [(-0.058, 0.102, 0.195), (-0.075, 0.086, 0.158)]:
        for r_ang in [0.72, -0.72]:
            h_parts.append(box_part(f"HXClip_{hx}_{r_ang}", (0.025, 0.004, 0.005), (hx, hy, hz), m_lilac, rot=(0, r_ang, math.radians(24)), bevel=0.001))

    # Ribbon Bows on Head (Twin-tail strands themselves are separate dynamic bones HERO_TwinTailL/R!)
    for sx in [-1, 1]:
        kx, ky, kz = sx * 0.118, -0.025, 0.195
        for loop_s in [-1, 1]:
            h_parts.append(box_part(
                f"HBow_{sx}_{loop_s}", (0.058, 0.024, 0.036),
                (kx + sx * 0.016, ky + loop_s * 0.025, kz + 0.025),
                m_purple, rot=(loop_s * 0.45, sx * -0.35, 0.3), bevel=0.006, subsurf=1
            ))
    join_into_mesh("HERO_Head", h_parts)

    # =========================================================================
    # 3. DYNAMIC PHYSICS TWIN-TAILS: HERO_TwinTailL (-X) & HERO_TwinTailR (+X)
    # Origin (0,0,0) at knot -> mounted at (±0.118, 0.195, 0.025) on headGroup!
    # =========================================================================
    for name, sx in [("HERO_TwinTailR", 1), ("HERO_TwinTailL", -1)]:
        tt_parts = []
        offsets = [(0, 0), (sx * 0.022, -0.015), (-sx * 0.015, -0.022), (sx * 0.018, 0.018), (0, -0.032)]
        for si, (ox, oy) in enumerate(offsets):
            tt_parts.append(bezier_strand_part(
                f"{name}_{si}",
                [
                    (0, 0, 0),
                    (sx * 0.055 + ox, -0.025 + oy, -0.08),
                    (sx * 0.095 + ox * 1.3, -0.040 + oy, -0.27),
                    (sx * 0.115 + ox * 1.5, -0.025 + oy, -0.45),
                    (sx * 0.085 + ox, 0.010 + oy, -0.56 + si * 0.015),
                ],
                [0.024, 0.034, 0.030, 0.019, 0.002],
                m_hair_tip if si >= 3 else m_hair
            ))
        join_into_mesh(name, tt_parts)

    # =========================================================================
    # 4. HERO_ArmR & HERO_ArmL (Billowy Black-Purple Techwear Sleeves in Aim Pose!)
    # =========================================================================
    for side, sx in [("HERO_ArmR", 1), ("HERO_ArmL", -1)]:
        a_parts = []
        if side == "HERO_ArmR":
            a_parts.append(loft_rings_part("HR_Sleeve", [
                (0.00, 0.00, -0.02, 0.058, 0.058),
                (-0.01, 0.05, -0.12, 0.076, 0.072),
                (-0.04, 0.11, -0.19, 0.086, 0.082),
                (-0.07, 0.17, -0.18, 0.046, 0.046),
            ], m_jacket))
            a_parts.append(cyl_part("HR_Cuff", 0.042, 0.045, 0.038, (-0.075, 0.19, -0.18), m_leather, rot=(math.radians(-78), 0, 0)))
            a_parts.append(box_part("HR_Hand", (0.042, 0.058, 0.042), (-0.085, 0.22, -0.18), m_skin, bevel=0.01))
        else:
            a_parts.append(loft_rings_part("HL_Sleeve", [
                (0.00, 0.00, -0.02, 0.058, 0.058),
                (0.07, 0.10, -0.11, 0.076, 0.072),
                (0.18, 0.23, -0.17, 0.088, 0.084),
                (0.30, 0.38, -0.15, 0.046, 0.046),
            ], m_jacket))
            a_parts.append(cyl_part("HL_Cuff", 0.042, 0.045, 0.038, (0.32, 0.41, -0.15), m_leather, rot=(math.radians(-82), math.radians(24), 0)))
            a_parts.append(box_part("HL_Hand", (0.042, 0.058, 0.042), (0.34, 0.44, -0.15), m_skin, bevel=0.01))
        join_into_mesh(side, a_parts)

    # =========================================================================
    # 5. HERO_LegL & HERO_LegR (Origin at Hip 0,0,0 -> Mounted at Y_three = 0.85m!)
    # =========================================================================
    hip_h = 0.85
    for side, sx in [("HERO_LegL", -1), ("HERO_LegR", 1)]:
        l_parts = []
        l_parts.append(loft_rings_part(f"{side}_Tights", [
            (0, 0.000, -hip_h + 0.14, 0.032, 0.034),
            (0, -0.006, -hip_h + 0.26, 0.040, 0.044),
            (0, -0.012, -hip_h + 0.39, 0.050, 0.054),
            (0, 0.004, -hip_h + 0.52, 0.046, 0.048),
            (0, 0.006, -hip_h + 0.66, 0.058, 0.062),
            (0, 0.000, -0.02, 0.068, 0.072),
        ], m_tights))
        if sx > 0:
            l_parts.append(cyl_part("HeroGarter", 0.062, 0.061, 0.024, (0, 0.004, -0.14), m_leather))
            l_parts.append(box_part("HeroGarterBuckle", (0.018, 0.010, 0.026), (0, 0.064, -0.14), m_silver, bevel=0.002))

        # Chunky Black-White-Purple Platform Sneakers (sole flush at -hip_h = -0.85!)
        l_parts.append(box_part(f"{side}_Outsole", (0.098, 0.220, 0.024), (0, 0.036, -hip_h + 0.012), m_purple, bevel=0.008, subsurf=1))
        l_parts.append(box_part(f"{side}_Midsole", (0.096, 0.215, 0.042), (0, 0.035, -hip_h + 0.044), m_white, bevel=0.012, subsurf=1))
        l_parts.append(box_part(f"{side}_Upper", (0.084, 0.180, 0.074), (0, 0.028, -hip_h + 0.096), m_leather, bevel=0.016, subsurf=1))
        l_parts.append(box_part(f"{side}_ToeW", (0.078, 0.068, 0.038), (0, 0.095, -hip_h + 0.078), m_white, bevel=0.012, subsurf=1))
        l_parts.append(cyl_part(f"{side}_Collar", 0.042, 0.046, 0.050, (0, -0.008, -hip_h + 0.140), m_leather))
        for li in range(3):
            l_parts.append(box_part(f"{side}_Lace_{li}", (0.050, 0.010, 0.006), (0, 0.054 + li * 0.018, -hip_h + 0.125 - li * 0.012), m_white, bevel=0.002))
        join_into_mesh(side, l_parts)

    # =========================================================================
    # 6. FIRST-PERSON 5-FINGER TECHWEAR SLEEVES & HANDS: FPS_ArmL_HERO & FPS_ArmR_HERO
    # =========================================================================
    for name, is_left in [("FPS_ArmL_HERO", True), ("FPS_ArmR_HERO", False)]:
        sx = -1 if is_left else 1
        fp = []
        # Billowy Black-Purple Techwear Sleeve + Glowing Violet Tech Stripe + Ribbed Cuff!
        fp.append(loft_rings_part(f"{name}_Sleeve", [
            (sx * 0.090, -0.30, -0.14, 0.068, 0.064),
            (sx * 0.062, -0.17, -0.09, 0.076, 0.072),
            (sx * 0.026, -0.075, -0.035, 0.042, 0.040),
        ], m_jacket))
        fp.append(bezier_strand_part(
            f"{name}_Stripe",
            [(sx * 0.09, -0.28, -0.075), (sx * 0.06, -0.16, -0.025), (sx * 0.03, -0.08, 0.002)],
            [0.006, 0.007, 0.005], m_lilac
        ))
        fp.append(cyl_part(f"{name}_Cuff", 0.036, 0.040, 0.038, (sx * 0.018, -0.058, -0.024), m_leather, rot=(math.radians(68), 0, sx * math.radians(16))))
        if is_left:
            # Purple Tech Bracelet & Holographic Charm on Left Wrist!
            fp.append(cyl_part(f"{name}_Bracelet", 0.035, 0.035, 0.012, (-0.010, -0.038, -0.014), m_purple, rot=(math.radians(68), 0, math.radians(-16))))
            fp.append(box_part(f"{name}_HoloGem", (0.022, 0.018, 0.008), (-0.002, -0.040, 0.014), m_glow, rot=(math.radians(20), math.radians(28), 0), bevel=0.002))

        # Slender Anime Pale Hand + 5 Sculpted Fingers!
        fp.append(box_part(f"{name}_Palm", (0.054, 0.066, 0.024), (0, 0.0, -0.010), m_skin, bevel=0.009))
        for fi, fy_off in enumerate([-0.020, -0.006, 0.008, 0.022]):
            fp.append(cyl_part(f"{name}_F1_{fi}", 0.0068, 0.0060, 0.032, (-sx * 0.022, fy_off + 0.014, 0.004), m_skin, verts=10, rot=(0, math.radians(55 * sx), 0)))
            fp.append(cyl_part(f"{name}_F2_{fi}", 0.0058, 0.0048, 0.022, (-sx * 0.019, fy_off + 0.014, 0.022), m_skin, verts=10, rot=(0, math.radians(-25 * sx), 0)))
        fp.append(cyl_part(f"{name}_Thumb", 0.0075, 0.0058, 0.038, (sx * 0.020, 0.022, 0.014), m_skin, verts=10, rot=(math.radians(-34), math.radians(-30 * sx), 0)))
        join_into_mesh(name, fp)

    out_glb = os.path.join(MODEL_DIR, "anime_hero_rigged.glb")
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', export_yup=True, export_apply=True)
    print(f"Exported Rigged Anime Hero GLB: {out_glb} ({os.path.getsize(out_glb)} bytes)")


if __name__ == "__main__":
    build_rigged_anime_hero()
