import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix, Euler

MODEL_DIR = r"e:\ai\cf-transport-ship-3d\public\models"
TEX_DIR = r"e:\ai\cf-transport-ship-3d\public\textures"
ARTIFACT_DIR = r"C:\Users\10534\.gemini\antigravity\brain\571f5b4e-2e7a-43fa-87c5-5cc78048968e"
os.makedirs(MODEL_DIR, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr_mat(name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.2, roughness=0.5, tex_file=None, bump_strength=0.0, emission=None):
    """Creates a Principled BSDF material; optionally links AI image texture + bump for Cycles studio renders,
    while keeping clean material slot names for lightweight GLB export."""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name=name)
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness

    if emission is not None and 'Emission Color' in bsdf.inputs:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = 4.0

    if tex_file:
        tex_path = os.path.join(TEX_DIR, tex_file)
        if os.path.exists(tex_path):
            tex_node = nt.nodes.new('ShaderNodeTexImage')
            tex_node.image = bpy.data.images.load(tex_path, check_existing=True)
            if base_color[:3] != (1.0, 1.0, 1.0):
                mix = nt.nodes.new('ShaderNodeMix')
                mix.data_type = 'RGBA'
                mix.blend_type = 'MULTIPLY'
                mix.inputs[0].default_value = 1.0
                mix.inputs[7].default_value = base_color
                nt.links.new(tex_node.outputs['Color'], mix.inputs[6])
                nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
            else:
                nt.links.new(tex_node.outputs['Color'], bsdf.inputs['Base Color'])

            if bump_strength > 0:
                bump = nt.nodes.new('ShaderNodeBump')
                bump.inputs['Strength'].default_value = bump_strength
                bump.inputs['Distance'].default_value = 0.015
                nt.links.new(tex_node.outputs['Color'], bump.inputs['Height'])
                nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def box_uv(obj, scale=2.2):
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
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
            uv_layer[li].uv = (u, w)


def add_bevel(obj, width=0.004, segments=2):
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(30)


def add_subsurf(obj, levels=1):
    mod = obj.modifiers.new(name="Subsurf", type='SUBSURF')
    mod.levels = levels
    mod.render_levels = levels


def part_box(name, size, loc, mat, rot=(0, 0, 0), bevel=0.004, subsurf=0, uv_scale=2.4):
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
    box_uv(obj, scale=uv_scale)
    if bevel > 0:
        add_bevel(obj, bevel, 2)
    if subsurf > 0:
        add_subsurf(obj, subsurf)
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def part_cyl(name, r1, r2, depth, loc, mat, verts=20, rot=(0, 0, 0), scale=(1, 1, 1), bevel=0.002, uv_scale=2.4):
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
    box_uv(obj, scale=uv_scale)
    if bevel > 0:
        add_bevel(obj, bevel, 1)
    return obj


def part_sphere(name, radius, loc, mat, scale=(1, 1, 1), rot=(0, 0, 0), u_seg=20, v_seg=14, uv_scale=2.4):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_seg, v_segments=v_seg, radius=radius)
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
    box_uv(obj, scale=uv_scale)
    return obj


def part_lofted_limb(name, rings, mat, uv_scale=2.5):
    """Lofts smooth anatomical cross-section ellipses: rings = list of (cx, cy, cz, rx, ry)."""
    bm = bmesh.new()
    seg = 16
    ring_verts = []
    for (cx, cy, cz, rx, ry) in rings:
        rv = []
        for i in range(seg):
            ang = (i / seg) * math.pi * 2
            vx = cx + math.cos(ang) * rx
            vy = cy + math.sin(ang) * ry
            rv.append(bm.verts.new((vx, vy, cz)))
        ring_verts.append(rv)

    for r in range(len(ring_verts) - 1):
        r0, r1 = ring_verts[r], ring_verts[r + 1]
        for i in range(seg):
            ni = (i + 1) % seg
            f = bm.faces.new([r0[i], r0[ni], r1[ni], r1[i]])
            f.smooth = True

    # Cap ends
    f_bot = bm.faces.new(list(reversed(ring_verts[0])))
    f_top = bm.faces.new(ring_verts[-1])
    f_bot.smooth = False
    f_top.smooth = False

    mesh = bpy.data.meshes.new(name + "_m")
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    box_uv(obj, scale=uv_scale)
    return obj


def join_parts(root_name, parts):
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


def strip_material_images_for_lightweight_glb():
    """Removes embedded image nodes before GLB export so Three.js binds the external optimized JPGs without duplicating bytes inside GLB."""
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        for n in list(nt.nodes):
            if n.type in ('TEX_IMAGE', 'BUMP', 'MIX'):
                nt.nodes.remove(n)
        if bsdf:
            bsdf.inputs['Base Color'].default_value = (0.92, 0.92, 0.92, 1.0) if mat.name in (
                'MAT_CHAR_GR_FABRIC', 'MAT_CHAR_BL_FABRIC', 'MAT_CHAR_VEST', 'MAT_CHAR_BANDANA',
                'MAT_WEP_WALNUT', 'MAT_WEP_CAMO', 'MAT_WEP_KIRIN_GOLD', 'MAT_WEP_GUNMETAL'
            ) else bsdf.inputs['Base Color'].default_value


# =============================================================================
# BUILD ARTICULATED SOLDIERS (GR SWAT 保卫者 & BL MERCENARY 潜伏者) + FPS 5-FINGER ARMS
# Reminder: +Y_b = -Z_three (Forward!), +Z_b = +Y_three (Up!), +X_b = +X_three (Right!)
# =============================================================================
def create_character_materials(with_textures=True):
    tf = lambda f: f if with_textures else None
    return {
        'gr_fab': make_pbr_mat('MAT_CHAR_GR_FABRIC', (1.0, 1.0, 1.0, 1.0), 0.08, 0.78, tf('gr_swat_fabric.jpg'), 0.25),
        'bl_fab': make_pbr_mat('MAT_CHAR_BL_FABRIC', (1.0, 1.0, 1.0, 1.0), 0.06, 0.80, tf('bl_merc_fabric.jpg'), 0.25),
        'vest': make_pbr_mat('MAT_CHAR_VEST', (1.0, 1.0, 1.0, 1.0), 0.18, 0.65, tf('tactical_vest_armor.jpg'), 0.35),
        'bandana': make_pbr_mat('MAT_CHAR_BANDANA', (1.0, 1.0, 1.0, 1.0), 0.06, 0.72, tf('bandana_crimson.jpg'), 0.22),
        'helmet_gr': make_pbr_mat('MAT_CHAR_HELMET_GR', (0.13, 0.19, 0.26, 1.0), 0.35, 0.44),
        'balaclava': make_pbr_mat('MAT_CHAR_BALACLAVA', (0.10, 0.11, 0.13, 1.0), 0.05, 0.86),
        'skin': make_pbr_mat('MAT_CHAR_SKIN', (0.84, 0.64, 0.49, 1.0), 0.04, 0.62),
        'visor_blue': make_pbr_mat('MAT_CHAR_VISOR_BLUE', (0.10, 0.48, 0.88, 1.0), 0.94, 0.08),
        'visor_gold': make_pbr_mat('MAT_CHAR_VISOR_GOLD', (0.92, 0.58, 0.12, 1.0), 0.95, 0.09),
        'armor_pad': make_pbr_mat('MAT_CHAR_PAD', (0.09, 0.11, 0.14, 1.0), 0.42, 0.38),
        'boot': make_pbr_mat('MAT_CHAR_BOOT', (0.08, 0.09, 0.10, 1.0), 0.22, 0.58),
        'boot_tan': make_pbr_mat('MAT_CHAR_BOOT_TAN', (0.46, 0.35, 0.22, 1.0), 0.10, 0.74),
        'metal': make_pbr_mat('MAT_CHAR_METAL', (0.58, 0.62, 0.66, 1.0), 0.88, 0.28),
        'watch_screen': make_pbr_mat('MAT_WATCH_GLOW', (0.15, 0.88, 0.55, 1.0), 0.2, 0.15, emission=(0.1, 0.85, 0.48)),
    }


def build_soldier_faction(prefix, is_gr, mats):
    fab = mats['gr_fab'] if is_gr else mats['bl_fab']
    vest = mats['vest']
    pad = mats['armor_pad']
    boot_m = mats['boot'] if is_gr else mats['boot_tan']

    # --- 1. TORSO + PELVIS + TACTICAL MOLLE RIG (Origin at feet 0,0,0; spans Z_b = 0.74..1.50) ---
    t_parts = []
    # Sculpted athletic V-tapered torso + pelvis loft
    t_parts.append(part_lofted_limb(f"{prefix}_BodyLoft", [
        (0, 0, 0.74, 0.185, 0.125),
        (0, 0, 0.86, 0.205, 0.138),
        (0, 0, 1.02, 0.195, 0.132),
        (0, 0, 1.22, 0.235, 0.155),
        (0, 0, 1.40, 0.245, 0.152),
        (0, 0, 1.49, 0.125, 0.105),
    ], fab, uv_scale=2.8))

    # Tactical combat collar
    t_parts.append(part_cyl(f"{prefix}_Collar", 0.115, 0.128, 0.08, (0, 0, 1.48), fab, verts=18, scale=(1.05, 0.92, 1)))

    # Heavy Duty Tactical Belt + Buckle + Drop-Leg Holster + Buttpack
    t_parts.append(part_cyl(f"{prefix}_Belt", 0.208, 0.208, 0.075, (0, 0, 0.89), pad, verts=20, scale=(1.04, 0.72, 1)))
    t_parts.append(part_box(f"{prefix}_Buckle", (0.065, 0.03, 0.055), (0, 0.148, 0.89), mats['metal'], bevel=0.004))
    t_parts.append(part_box(f"{prefix}_Buttpack", (0.20, 0.095, 0.14), (0, -0.165, 0.92), vest, bevel=0.012))

    # Sculpted Front & Rear SAPI Ballistic Plate Carrier Vest!
    t_parts.append(part_box(f"{prefix}_PlateFront", (0.34, 0.065, 0.38), (0, 0.135, 1.20), vest, rot=(math.radians(-5), 0, 0), bevel=0.018))
    t_parts.append(part_box(f"{prefix}_PlateBack", (0.34, 0.065, 0.39), (0, -0.135, 1.21), vest, rot=(math.radians(4), 0, 0), bevel=0.018))
    t_parts.append(part_box(f"{prefix}_CummerbundL", (0.06, 0.24, 0.16), (-0.205, 0, 1.12), vest, bevel=0.01))
    t_parts.append(part_box(f"{prefix}_CummerbundR", (0.06, 0.24, 0.16), (0.205, 0, 1.12), vest, bevel=0.01))

    # Shoulder pads/straps on vest + Tactical Walkie-Talkie Radio + Whip Antenna!
    for sx in [-1, 1]:
        t_parts.append(part_box(f"{prefix}_VestStrap_{sx}", (0.078, 0.24, 0.045), (sx * 0.135, 0, 1.43), vest, bevel=0.008))
    t_parts.append(part_box(f"{prefix}_Radio", (0.055, 0.042, 0.105), (-0.145, 0.135, 1.36), pad, bevel=0.005))
    t_parts.append(part_cyl(f"{prefix}_Antenna", 0.005, 0.003, 0.28, (-0.155, 0.12, 1.54), pad, verts=8, bevel=0))

    # 3 Sculpted Rifle Magazine Pouches + 2 Frag Grenade Pouches across front chest!
    for mx in [-0.105, 0.0, 0.105]:
        t_parts.append(part_box(f"{prefix}_MagPouch_{mx}", (0.078, 0.055, 0.145), (mx, 0.182, 1.11), vest, bevel=0.008))
        t_parts.append(part_box(f"{prefix}_MagTab_{mx}", (0.072, 0.058, 0.035), (mx, 0.186, 1.175), pad, bevel=0.004))
    for gx in [-0.17, 0.17]:
        t_parts.append(part_cyl(f"{prefix}_NadePouch_{gx}", 0.036, 0.036, 0.09, (gx, 0.145, 0.96), vest, verts=12))

    if not is_gr:
        # Black List iconic diagonal chest combat-knife sheath!
        t_parts.append(part_box(f"{prefix}_ChestSheath", (0.042, 0.028, 0.18), (0.09, 0.18, 1.31), pad, rot=(0, math.radians(34), 0), bevel=0.004))

    torso_obj = join_parts(f"{prefix}_Torso", t_parts)

    # --- 2. HEAD + HELMET / BANDANA + BALLISTIC GOGGLES + COMTAC HEADSET (Origin at Neck 0,0,0) ---
    h_parts = []
    # Neck + Sculpted Cranium
    h_parts.append(part_cyl(f"{prefix}_Neck", 0.068, 0.075, 0.11, (0, -0.01, 0.04), mats['balaclava'] if is_gr else mats['skin'], verts=16))
    h_parts.append(part_sphere(f"{prefix}_Skull", 0.125, (0, 0.01, 0.155), mats['balaclava'] if is_gr else mats['skin'], scale=(0.92, 1.04, 1.12)))

    if is_gr:
        # Global Risk SWAT: Dark Balaclava + Curved Blue Reflective Tactical Goggles + PASGT Helmet + NVG Mount + Headset!
        h_parts.append(part_box(f"{prefix}_GoggleFrame", (0.21, 0.065, 0.074), (0, 0.105, 0.165), pad, bevel=0.012))
        h_parts.append(part_sphere(f"{prefix}_GoggleLens", 0.108, (0, 0.062, 0.165), mats['visor_blue'], scale=(0.96, 0.78, 0.34)))
        h_parts.append(part_cyl(f"{prefix}_GoggleStrap", 0.122, 0.122, 0.032, (0, 0.008, 0.168), pad, verts=20, scale=(0.94, 1.06, 1)))

        # Sculpted PASGT / FAST Ballistic Helmet dome + flared ear-guards + NVG Shroud + Side Rails
        bm_h = bmesh.new()
        bmesh.ops.create_uvsphere(bm_h, u_segments=24, v_segments=16, radius=0.146)
        for v in list(bm_h.verts):
            if v.co.z < -0.025:
                bm_h.verts.remove(v)
            else:
                # Slight flare over ears & brow
                if v.co.z < 0.03 and abs(v.co.x) > 0.08:
                    v.co.x *= 1.08
                    v.co.z -= 0.02
                v.co.y *= 1.07
        hm = bpy.data.meshes.new(f"{prefix}_Helm_m")
        bm_h.to_mesh(hm)
        bm_h.free()
        helm = bpy.data.objects.new(f"{prefix}_Helm", hm)
        bpy.context.collection.objects.link(helm)
        helm.location = (0, 0.005, 0.185)
        helm.data.materials.append(mats['helmet_gr'])
        for p in helm.data.polygons:
            p.use_smooth = True
        box_uv(helm)
        solid = helm.modifiers.new("Solidify", 'SOLIDIFY')
        solid.thickness = 0.016
        add_bevel(helm, 0.003, 1)
        h_parts.append(helm)

        # Forehead Aluminum NVG Mount + Side Picatinny Helmet Rails + ComTac Ear-Cups
        h_parts.append(part_box(f"{prefix}_NVGMount", (0.048, 0.025, 0.052), (0, 0.152, 0.235), mats['metal'], rot=(math.radians(18), 0, 0), bevel=0.004))
        for sx in [-1, 1]:
            h_parts.append(part_box(f"{prefix}_HelmRail_{sx}", (0.018, 0.11, 0.024), (sx * 0.142, 0.02, 0.205), pad, bevel=0.003))
            h_parts.append(part_cyl(f"{prefix}_EarCup_{sx}", 0.044, 0.038, 0.032, (sx * 0.132, 0.0, 0.145), pad, verts=16, rot=(0, math.pi / 2, 0)))
    else:
        # Black List Mercenary: Lower Tactical Half-Mask + Gold-Mirror Aviator Tactical Shades + Crimson Knotted Bandana!
        h_parts.append(part_sphere(f"{prefix}_HalfMask", 0.122, (0, 0.022, 0.115), mats['balaclava'], scale=(0.91, 1.05, 0.68)))
        h_parts.append(part_box(f"{prefix}_ShadesFrame", (0.20, 0.045, 0.052), (0, 0.112, 0.172), pad, bevel=0.008))
        for sx in [-1, 1]:
            h_parts.append(part_sphere(f"{prefix}_ShadeLens_{sx}", 0.048, (sx * 0.048, 0.125, 0.172), mats['visor_gold'], scale=(1.05, 0.42, 0.68)))

        # Crimson knotted bandana dome + headband + two trailing knot tails at the back!
        bm_b = bmesh.new()
        bmesh.ops.create_uvsphere(bm_b, u_segments=22, v_segments=14, radius=0.134)
        for v in list(bm_b.verts):
            if v.co.z < 0.015:
                bm_b.verts.remove(v)
            else:
                v.co.y *= 1.06
        bm_mesh = bpy.data.meshes.new(f"{prefix}_BandanaCap_m")
        bm_b.to_mesh(bm_mesh)
        bm_b.free()
        bcap = bpy.data.objects.new(f"{prefix}_BandanaCap", bm_mesh)
        bpy.context.collection.objects.link(bcap)
        bcap.location = (0, 0.008, 0.175)
        bcap.data.materials.append(mats['bandana'])
        for p in bcap.data.polygons:
            p.use_smooth = True
        box_uv(bcap, scale=3.0)
        h_parts.append(bcap)

        h_parts.append(part_cyl(f"{prefix}_Headband", 0.132, 0.130, 0.048, (0, 0.008, 0.205), mats['bandana'], verts=22, scale=(0.94, 1.07, 1)))
        h_parts.append(part_sphere(f"{prefix}_Knot", 0.032, (0, -0.135, 0.195), mats['bandana']))
        for sx in [-1, 1]:
            h_parts.append(part_box(f"{prefix}_Tail_{sx}", (0.028, 0.014, 0.13), (sx * 0.024, -0.155, 0.135), mats['bandana'], rot=(math.radians(18), sx * math.radians(14), 0), bevel=0.004))

    head_obj = join_parts(f"{prefix}_Head", h_parts)

    # --- 3. RIGHT & LEFT ARTICULATED ARMS (Origin at Shoulder 0,0,0; Two-Handed Rifle Aim Pose) ---
    arm_objs = {}
    for side, sx in [('ArmR', 1), ('ArmL', -1)]:
        a_parts = []
        # Smoothly integrated Deltoid Shoulder Cap
        a_parts.append(part_sphere(f"{prefix}_{side}_Shoulder", 0.068, (sx * 0.01, 0.0, -0.015), fab, scale=(0.95, 1.0, 1.08)))
        a_parts.append(part_box(f"{prefix}_{side}_DeltoidPad", (0.042, 0.095, 0.11), (sx * 0.052, 0.0, -0.045), pad, rot=(0, sx * math.radians(-12), 0), bevel=0.012))

        if side == 'ArmR':
            # Right arm reaches down & slightly inward (-0.09) to rifle pistol grip at Y=+0.18, Z=-0.20
            a_parts.append(part_lofted_limb(f"{prefix}_ArmR_Loft", [
                (0.01, 0.00, -0.02, 0.056, 0.056),
                (-0.01, 0.04, -0.13, 0.050, 0.050),
                (-0.04, 0.09, -0.20, 0.046, 0.046),
                (-0.08, 0.17, -0.19, 0.040, 0.040),
            ], fab, uv_scale=3.0))
            a_parts.append(part_sphere(f"{prefix}_ArmR_Elbow", 0.046, (-0.035, 0.075, -0.21), pad))
            a_parts.append(part_box(f"{prefix}_ArmR_Glove", (0.052, 0.075, 0.054), (-0.09, 0.21, -0.185), pad, bevel=0.01))
        else:
            # Left arm reaches across chest (+0.36 rightward from left shoulder = X_world +0.125!) to rifle handguard at Y=+0.44, Z=-0.16
            a_parts.append(part_lofted_limb(f"{prefix}_ArmL_Loft", [
                (-0.01, 0.00, -0.02, 0.056, 0.056),
                (0.06, 0.10, -0.12, 0.050, 0.050),
                (0.16, 0.22, -0.18, 0.045, 0.045),
                (0.32, 0.40, -0.16, 0.039, 0.039),
            ], fab, uv_scale=3.0))
            a_parts.append(part_sphere(f"{prefix}_ArmL_Elbow", 0.046, (0.15, 0.20, -0.195), pad))
            a_parts.append(part_box(f"{prefix}_ArmL_Glove", (0.056, 0.082, 0.050), (0.36, 0.45, -0.155), pad, bevel=0.01))

        arm_objs[side] = join_parts(f"{prefix}_{side}", a_parts)

    # --- 4. LEFT & RIGHT ARTICULATED LEGS + CARGO POCKETS + KNEE PADS + COMBAT BOOTS (Origin at Hip 0,0,0) ---
    leg_objs = {}
    for side, sx in [('LegL', -1), ('LegR', 1)]:
        l_parts = []
        # Lofted Cargo Trousers from Hip (0) down to Ankle (-0.64)
        l_parts.append(part_lofted_limb(f"{prefix}_{side}_Loft", [
            (0, 0, -0.64, 0.058, 0.062),
            (0, 0, -0.52, 0.074, 0.078),
            (0, 0.008, -0.36, 0.082, 0.086),
            (0, 0.005, -0.18, 0.096, 0.102),
            (0, 0, 0.02, 0.104, 0.108),
        ], fab, uv_scale=2.8))

        # Side Thigh Cargo Pocket / Drop-Leg Panel
        l_parts.append(part_box(f"{prefix}_{side}_Pocket", (0.036, 0.13, 0.16), (sx * 0.095, 0.005, -0.20), vest if sx > 0 else fab, bevel=0.008))
        # Hard-Shell Tactical Knee Pad + Elastic Straps!
        l_parts.append(part_box(f"{prefix}_{side}_KneePad", (0.115, 0.048, 0.125), (0, 0.078, -0.36), pad, bevel=0.014))
        l_parts.append(part_cyl(f"{prefix}_{side}_KneeStrap", 0.086, 0.086, 0.028, (0, 0.005, -0.36), pad, verts=16))

        # Sculpted Multi-Part Laced Tactical Combat Boot (Z_b = -0.78.. -0.60)
        l_parts.append(part_cyl(f"{prefix}_{side}_BootShaft", 0.062, 0.066, 0.12, (0, -0.005, -0.65), boot_m, verts=14))
        l_parts.append(part_box(f"{prefix}_{side}_BootFoot", (0.112, 0.22, 0.085), (0, 0.038, -0.725), boot_m, bevel=0.018))
        l_parts.append(part_sphere(f"{prefix}_{side}_ToeCap", 0.056, (0, 0.125, -0.735), pad, scale=(0.98, 1.15, 0.68)))
        l_parts.append(part_box(f"{prefix}_{side}_Sole", (0.118, 0.245, 0.030), (0, 0.040, -0.765), pad, bevel=0.006))

        leg_objs[side] = join_parts(f"{prefix}_{side}", l_parts)

    return torso_obj, head_obj, arm_objs['ArmR'], arm_objs['ArmL'], leg_objs['LegL'], leg_objs['LegR']


def build_fps_5finger_hand_and_forearm(name, is_left, is_gr, mats):
    """Builds a sculpted First-Person forearm sleeve + tactical watch (left wrist) + 5-finger carbon-knuckle glove!
    Origin (0,0,0) is right at the palm grip center so viewmodel.ts can position it directly on any weapon!"""
    fab = mats['gr_fab'] if is_gr else mats['bl_fab']
    glove = mats['armor_pad']
    skin = mats['skin']
    sx = -1 if is_left else 1

    parts = []
    # Forearm sleeve extending back toward player shoulder (-Y_b = +Z_three!)
    parts.append(part_lofted_limb(f"{name}_Sleeve", [
        (sx * 0.085, -0.30, -0.13, 0.052, 0.050),
        (sx * 0.055, -0.18, -0.08, 0.046, 0.044),
        (sx * 0.022, -0.07, -0.03, 0.038, 0.036),
    ], fab, uv_scale=3.2))

    # Neoprene cuff + Tactical Digital GPS Watch on Left Wrist!
    parts.append(part_cyl(f"{name}_Cuff", 0.038, 0.040, 0.038, (sx * 0.018, -0.058, -0.024), glove, verts=16, rot=(math.radians(68), 0, sx * math.radians(16))))
    if is_left:
        parts.append(part_box(f"{name}_WatchBody", (0.036, 0.028, 0.014), (-0.004, -0.052, 0.006), mats['metal'], rot=(math.radians(20), math.radians(28), 0), bevel=0.004))
        parts.append(part_box(f"{name}_WatchScreen", (0.026, 0.020, 0.004), (-0.001, -0.050, 0.013), mats['watch_screen'], rot=(math.radians(20), math.radians(28), 0), bevel=0.001))

    # Sculpted Palm + Carbon-Fiber Knuckle Plate
    parts.append(part_box(f"{name}_Palm", (0.062, 0.072, 0.028), (0, 0.0, -0.012), glove, bevel=0.008))
    parts.append(part_box(f"{name}_Knuckles", (0.060, 0.022, 0.014), (0, 0.022, -0.025), mats['metal'], bevel=0.005))

    # 4 Curled Fingers wrapping around rifle handguard / pistol grip + Opposing Thumb!
    for fi, fy_off in enumerate([-0.022, -0.006, 0.010, 0.025]):
        parts.append(part_cyl(f"{name}_F1_{fi}", 0.0085, 0.0078, 0.034, (-sx * 0.026, fy_off + 0.015, 0.004), glove, verts=10, rot=(0, math.radians(55 * sx), 0)))
        parts.append(part_cyl(f"{name}_F2_{fi}", 0.0075, 0.0065, 0.024, (-sx * 0.022, fy_off + 0.015, 0.024), skin if not is_gr else glove, verts=10, rot=(0, math.radians(-25 * sx), 0)))

    # Thumb wrapping over left/top side
    parts.append(part_cyl(f"{name}_Thumb1", 0.010, 0.0085, 0.038, (sx * 0.024, 0.018, 0.012), glove, verts=10, rot=(math.radians(-28), math.radians(-35 * sx), 0)))
    parts.append(part_cyl(f"{name}_Thumb2", 0.0082, 0.0070, 0.024, (sx * 0.014, 0.036, 0.026), skin if not is_gr else glove, verts=10, rot=(math.radians(-45), 0, 0)))

    return join_parts(name, parts)


# =============================================================================
# BUILD ULTRA-REFINED V2 HIGH-PRECISION WEAPONS
# =============================================================================
def create_weapon_materials(with_textures=True):
    tf = lambda f: f if with_textures else None
    return {
        'gunmetal': make_pbr_mat('MAT_WEP_GUNMETAL', (1.0, 1.0, 1.0, 1.0), 0.88, 0.28, tf('gunmetal_brushed.jpg'), 0.18),
        'dark': make_pbr_mat('MAT_WEP_DARKSTEEL', (0.11, 0.13, 0.16, 1.0), 0.84, 0.34),
        'chrome': make_pbr_mat('MAT_WEP_CHROME', (0.88, 0.91, 0.95, 1.0), 0.97, 0.14),
        'kirin_gold': make_pbr_mat('MAT_WEP_KIRIN_GOLD', (1.0, 1.0, 1.0, 1.0), 0.92, 0.24, tf('ak47_kirin_gold.jpg'), 0.45),
        'bright_gold': make_pbr_mat('MAT_WEP_GOLD', (0.96, 0.72, 0.20, 1.0), 0.95, 0.18),
        'ruby_eye': make_pbr_mat('MAT_WEP_RUBY', (1.0, 0.12, 0.06, 1.0), 0.2, 0.1, emission=(1.0, 0.18, 0.05)),
        'walnut': make_pbr_mat('MAT_WEP_WALNUT', (1.0, 1.0, 1.0, 1.0), 0.10, 0.42, tf('gun_walnut.jpg'), 0.22),
        'camo': make_pbr_mat('MAT_WEP_CAMO', (1.0, 1.0, 1.0, 1.0), 0.42, 0.40, tf('gun_camo.jpg'), 0.20),
        'olive': make_pbr_mat('MAT_WEP_OLIVE', (0.22, 0.36, 0.20, 1.0), 0.20, 0.48),
        'lens': make_pbr_mat('MAT_WEP_LENS', (0.12, 0.56, 0.96, 1.0), 0.96, 0.05),
        'red': make_pbr_mat('MAT_WEP_RED', (0.88, 0.16, 0.12, 1.0), 0.25, 0.36),
    }


def build_v2_weapons(wm):
    objs = {}

    # ---- 1) ULTRA-REFINED AK-47 FIRE-KIRIN (火麒麟精雕版) ----
    ak = []
    # Milled/Stamped Receiver + Engraved Fire-Kirin Golden Side Relief Plates!
    ak.append(part_box("AK_Rec", (0.044, 0.275, 0.066), (0, 0.05, 0.0), wm['gunmetal'], bevel=0.005))
    ak.append(part_box("AK_KirinPlateL", (0.048, 0.22, 0.046), (0, 0.055, -0.004), wm['kirin_gold'], bevel=0.004, uv_scale=4.0))
    # Smooth Ribbed Dust Cover + Tangent Rear Leaf Sight + Bolt Carrier & Curved Charging Handle
    ak.append(part_cyl("AK_Cover", 0.023, 0.022, 0.245, (0, 0.042, 0.034), wm['gunmetal'], verts=20, rot=(math.pi / 2, 0, 0)))
    ak.append(part_box("AK_RearSightBase", (0.028, 0.058, 0.024), (0, 0.195, 0.036), wm['dark'], bevel=0.003))
    ak.append(part_box("AK_RearLeaf", (0.022, 0.048, 0.008), (0, 0.20, 0.050), wm['chrome'], bevel=0.002))
    ak.append(part_box("AK_EjectPort", (0.012, 0.085, 0.022), (0.021, 0.105, 0.022), wm['chrome'], bevel=0.002))
    ak.append(part_cyl("AK_ChargingHandle", 0.005, 0.007, 0.036, (0.036, 0.135, 0.022), wm['bright_gold'], verts=12, rot=(0, math.pi / 2, 0)))
    ak.append(part_box("AK_SafetyLever", (0.006, 0.115, 0.016), (0.025, 0.055, -0.002), wm['dark'], rot=(math.radians(-6), 0, 0), bevel=0.002))

    # Swept Organic Golden Kirin Dorsal Scales + Sculpted Kirin Beast Head & Glowing Ruby Eyes on Forend!
    for i in range(9):
        y_pos = -0.055 + i * 0.028
        ak.append(part_cyl(
            f"AK_Fin_{i}", 0.018, 0.003, 0.036,
            (0, y_pos, 0.052), wm['bright_gold'], verts=8,
            rot=(math.radians(-52), 0, 0), scale=(0.55, 1.0, 1.0), bevel=0.002
        ))
    # Sculpted Kirin Dragon Forend Armor + Horns + Glowing Ruby Eyes!
    ak.append(part_sphere("AK_KirinSnout", 0.034, (0, 0.395, 0.016), wm['kirin_gold'], scale=(0.92, 1.55, 0.88), uv_scale=4.0))
    for sx in [-1, 1]:
        ak.append(part_cyl(f"AK_KirinHorn_{sx}", 0.008, 0.0015, 0.095, (sx * 0.024, 0.355, 0.042), wm['bright_gold'], verts=10, rot=(math.radians(-68), sx * math.radians(-14), 0)))
        ak.append(part_sphere(f"AK_RubyEye_{sx}", 0.0065, (sx * 0.027, 0.405, 0.022), wm['ruby_eye']))

    # Trigger Guard + Curved Trigger + Contoured Finger-Grooved Walnut Grip & Cheek-Rest Buttstock
    ak.append(part_box("AK_TrigGuard", (0.014, 0.056, 0.032), (0, -0.008, -0.046), wm['dark'], bevel=0.004))
    ak.append(part_cyl("AK_Trigger", 0.004, 0.003, 0.026, (0, -0.002, -0.042), wm['bright_gold'], verts=8, rot=(math.radians(24), 0, 0)))
    ak.append(part_box("AK_Grip", (0.031, 0.046, 0.112), (0, -0.036, -0.080), wm['walnut'], rot=(math.radians(-26), 0, 0), bevel=0.008))
    ak.append(part_box("AK_Stock", (0.042, 0.215, 0.078), (0, -0.185, -0.030), wm['walnut'], rot=(math.radians(13), 0, 0), bevel=0.009, uv_scale=3.5))
    ak.append(part_box("AK_StockComb", (0.038, 0.14, 0.022), (0, -0.175, 0.006), wm['walnut'], rot=(math.radians(6), 0, 0), bevel=0.006, uv_scale=3.5))
    ak.append(part_box("AK_Buttplate", (0.044, 0.016, 0.090), (0, -0.292, -0.052), wm['bright_gold'], rot=(math.radians(13), 0, 0), bevel=0.004))

    # Contoured Walnut Upper/Lower Handguard + Vents + Rifled Barrel + Cleaning Rod + Circular Front Sight Hood + Bayonet Lug!
    ak.append(part_cyl("AK_GuardLower", 0.026, 0.024, 0.195, (0, 0.295, -0.004), wm['walnut'], verts=16, rot=(math.pi / 2, 0, 0), scale=(0.95, 0.88, 1)))
    ak.append(part_cyl("AK_GuardUpper", 0.021, 0.020, 0.175, (0, 0.290, 0.024), wm['walnut'], verts=16, rot=(math.pi / 2, 0, 0)))
    ak.append(part_cyl("AK_Barrel", 0.010, 0.0115, 0.34, (0, 0.545, 0.008), wm['gunmetal'], verts=20, rot=(math.pi / 2, 0, 0)))
    ak.append(part_cyl("AK_CleanRod", 0.0035, 0.0035, 0.26, (0, 0.535, -0.006), wm['dark'], verts=10, rot=(math.pi / 2, 0, 0)))
    ak.append(part_cyl("AK_GasTube", 0.009, 0.009, 0.15, (0, 0.465, 0.029), wm['gunmetal'], verts=14, rot=(math.pi / 2, 0, 0)))
    ak.append(part_box("AK_GasBlock", (0.022, 0.034, 0.040), (0, 0.540, 0.018), wm['gunmetal'], bevel=0.004))

    # Iconic AK Circular Front Sight Hood + Center Post + Slant Brake!
    ak.append(part_box("AK_FSBase", (0.016, 0.028, 0.036), (0, 0.665, 0.024), wm['dark'], bevel=0.003))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.013, minor_radius=0.0025, major_segments=20, minor_segments=8, location=(0, 0.665, 0.046), rotation=(math.pi / 2, 0, 0))
    hood = bpy.context.active_object
    hood.data.materials.append(wm['dark'])
    box_uv(hood)
    ak.append(hood)
    ak.append(part_cyl("AK_FSPost", 0.0018, 0.0018, 0.014, (0, 0.665, 0.043), wm['bright_gold'], verts=8))
    ak.append(part_cyl("AK_SlantBrake", 0.013, 0.012, 0.048, (0, 0.720, 0.008), wm['bright_gold'], verts=16, rot=(math.pi / 2, 0, 0)))

    # Smooth 10-Slice Curved Ribbed Banana Magazine with Kirin Scale Plating!
    for seg in range(10):
        t = seg / 9.0
        ang = math.radians(8 + t * 32)
        my = 0.142 + math.sin(ang) * seg * 0.017
        mz = -0.048 - math.cos(ang) * seg * 0.021
        ak.append(part_box(
            f"AK_MagSeg_{seg}", (0.033, 0.056, 0.026),
            (0, my, mz), wm['kirin_gold'] if seg % 2 == 1 else wm['gunmetal'],
            rot=(-ang, 0, 0), bevel=0.003, uv_scale=4.0
        ))
    objs['ak47'] = join_parts("Weapon_AK47", ak)

    # ---- 2) ULTRA-REFINED M4A1-S CAMO SUPPRESSED (迷彩消音精修版) ----
    m4 = []
    m4.append(part_box("M4_Upper", (0.048, 0.24, 0.052), (0, 0.04, 0.014), wm['camo'], bevel=0.006))
    m4.append(part_box("M4_Lower", (0.044, 0.20, 0.046), (0, 0.045, -0.024), wm['camo'], bevel=0.005))
    m4.append(part_box("M4_MagWell", (0.046, 0.072, 0.052), (0, 0.125, -0.042), wm['camo'], bevel=0.004))
    m4.append(part_cyl("M4_FwdAssist", 0.007, 0.007, 0.028, (0.026, -0.045, 0.016), wm['dark'], verts=10, rot=(math.pi / 2, math.radians(-22), 0)))
    m4.append(part_box("M4_ChargeHandle", (0.044, 0.022, 0.012), (0, -0.082, 0.034), wm['dark'], bevel=0.002))

    # Forged Carry Handle + Rear Sight Aperture & Windage Drum
    m4.append(part_box("M4_CarryTop", (0.022, 0.165, 0.015), (0, 0.035, 0.066), wm['dark'], bevel=0.004))
    for py in [-0.035, 0.10]:
        m4.append(part_box(f"M4_CarryPillar_{py}", (0.020, 0.024, 0.030), (0, py, 0.048), wm['dark'], bevel=0.003))
    m4.append(part_cyl("M4_WindDrum", 0.009, 0.009, 0.034, (0, -0.035, 0.066), wm['gunmetal'], verts=12, rot=(0, math.pi / 2, 0)))

    # SOPMOD Collapsible 6-Position Stock + Ergonomic A2 Grip + Trigger Guard
    m4.append(part_cyl("M4_BufTube", 0.016, 0.016, 0.20, (0, -0.175, 0.012), wm['gunmetal'], verts=16, rot=(math.pi / 2, 0, 0)))
    m4.append(part_box("M4_SOPMOD", (0.044, 0.16, 0.105), (0, -0.225, -0.020), wm['camo'], bevel=0.008))
    m4.append(part_box("M4_ButtPad", (0.046, 0.016, 0.108), (0, -0.308, -0.020), wm['dark'], bevel=0.004))
    m4.append(part_box("M4_Grip", (0.031, 0.046, 0.105), (0, -0.028, -0.078), wm['dark'], rot=(math.radians(-25), 0, 0), bevel=0.006))
    m4.append(part_box("M4_TrigGuard", (0.014, 0.055, 0.024), (0, 0.035, -0.052), wm['dark'], bevel=0.002))

    # Ventilated Quad-Rail RIS Handguard + 12 Picatinny Teeth + A2 Triangle Front Sight + Fluted M4A1-S Suppressor!
    m4.append(part_cyl("M4_RIS", 0.029, 0.029, 0.225, (0, 0.280, 0.010), wm['camo'], verts=16, rot=(math.pi / 2, 0, 0)))
    for r in range(11):
        ry = 0.175 + r * 0.019
        m4.append(part_box(f"M4_RailT_{r}", (0.022, 0.010, 0.008), (0, ry, 0.040), wm['dark'], bevel=0.001))
        if r % 2 == 0:
            m4.append(part_cyl(f"M4_Vent_{r}", 0.006, 0.006, 0.062, (0, ry, 0.010), wm['dark'], verts=10, rot=(0, math.pi / 2, 0)))

    m4.append(part_box("M4_A2FrontLeg1", (0.013, 0.016, 0.056), (0, 0.405, 0.038), wm['dark'], rot=(math.radians(22), 0, 0), bevel=0.002))
    m4.append(part_box("M4_A2FrontLeg2", (0.013, 0.014, 0.052), (0, 0.425, 0.038), wm['dark'], rot=(math.radians(-6), 0, 0), bevel=0.002))
    m4.append(part_cyl("M4_Suppressor", 0.020, 0.020, 0.275, (0, 0.570, 0.010), wm['gunmetal'], verts=24, rot=(math.pi / 2, 0, 0)))
    for gr in range(7):
        m4.append(part_cyl(f"M4_SupGroove_{gr}", 0.0218, 0.0218, 0.010, (0, 0.46 + gr * 0.032, 0.010), wm['dark'], verts=24, rot=(math.pi / 2, 0, 0)))

    # Curved 30/35-Round STANAG Magazine with Witness Ribs
    for seg in range(5):
        ang = math.radians(6 + seg * 4.5)
        m4.append(part_box(
            f"M4_Mag_{seg}", (0.031, 0.056, 0.036),
            (0, 0.125 + seg * 0.006, -0.062 - seg * 0.031), wm['gunmetal'],
            rot=(-ang, 0, 0), bevel=0.003
        ))
    objs['m4a1s'] = join_parts("Weapon_M4A1S", m4)

    # ---- 3) ULTRA-REFINED AWM-A SNIPER (绿皮狙击精修版) ----
    awm = []
    awm.append(part_box("AWM_Forend", (0.050, 0.44, 0.064), (0, 0.20, -0.006), wm['olive'], bevel=0.009))
    awm.append(part_box("AWM_Action", (0.046, 0.22, 0.052), (0, 0.08, 0.018), wm['gunmetal'], bevel=0.005))
    # Sculpted Thumbhole Stock Frame (Upper Cheek Bridge + Lower Thumbhole Spar + Buttpad)
    awm.append(part_box("AWM_StockTop", (0.044, 0.24, 0.044), (0, -0.18, -0.004), wm['olive'], bevel=0.008))
    awm.append(part_box("AWM_StockBot", (0.040, 0.24, 0.032), (0, -0.18, -0.072), wm['olive'], rot=(math.radians(-6), 0, 0), bevel=0.007))
    awm.append(part_box("AWM_StockGrip", (0.042, 0.044, 0.088), (0, -0.045, -0.046), wm['olive'], rot=(math.radians(-16), 0, 0), bevel=0.007))
    awm.append(part_box("AWM_StockRear", (0.046, 0.055, 0.115), (0, -0.295, -0.038), wm['olive'], bevel=0.007))
    awm.append(part_box("AWM_CheekRest", (0.048, 0.125, 0.030), (0, -0.19, 0.032), wm['dark'], bevel=0.006))
    awm.append(part_box("AWM_ButtRubber", (0.048, 0.022, 0.118), (0, -0.33, -0.038), wm['dark'], bevel=0.004))

    # Heavy Fluted Match Barrel + 3-Chamber Muzzle Brake + Folded Spring Bipod
    awm.append(part_cyl("AWM_Barrel", 0.0125, 0.016, 0.48, (0, 0.61, 0.018), wm['gunmetal'], verts=20, rot=(math.pi / 2, 0, 0)))
    awm.append(part_box("AWM_MuzzleBrake", (0.034, 0.068, 0.028), (0, 0.855, 0.018), wm['dark'], bevel=0.004))
    for sx in [-1, 1]:
        awm.append(part_cyl(f"AWM_Bipod_{sx}", 0.0075, 0.0075, 0.21, (sx * 0.028, 0.35, -0.052), wm['dark'], verts=10, rot=(math.pi / 2, 0, 0)))
        awm.append(part_cyl(f"AWM_Foot_{sx}", 0.012, 0.010, 0.025, (sx * 0.028, 0.46, -0.052), wm['dark'], verts=10, rot=(math.pi / 2, 0, 0)))

    # High-Detail Variable Sniper Scope + Picatinny Rail + Turret Drums + Sapphire Optical Lenses!
    awm.append(part_box("AWM_PicRail", (0.024, 0.19, 0.012), (0, 0.095, 0.046), wm['dark'], bevel=0.002))
    for ry in [0.035, 0.175]:
        awm.append(part_cyl(f"AWM_ScopeRing_{ry}", 0.022, 0.022, 0.022, (0, ry, 0.070), wm['dark'], verts=18, rot=(math.pi / 2, 0, 0)))
    awm.append(part_cyl("AWM_ScopeTube", 0.0165, 0.0165, 0.26, (0, 0.115, 0.070), wm['dark'], verts=22, rot=(math.pi / 2, 0, 0)))
    awm.append(part_cyl("AWM_Eyepiece", 0.018, 0.024, 0.065, (0, -0.030, 0.070), wm['dark'], verts=22, rot=(math.pi / 2, 0, 0)))
    awm.append(part_cyl("AWM_LensRear", 0.021, 0.021, 0.006, (0, -0.063, 0.070), wm['lens'], verts=22, rot=(math.pi / 2, 0, 0)))
    awm.append(part_cyl("AWM_ObjBell", 0.029, 0.017, 0.085, (0, 0.275, 0.070), wm['dark'], verts=22, rot=(math.pi / 2, 0, 0)))
    awm.append(part_cyl("AWM_LensFront", 0.026, 0.026, 0.006, (0, 0.318, 0.070), wm['lens'], verts=22, rot=(math.pi / 2, 0, 0)))
    awm.append(part_cyl("AWM_ElevTurret", 0.012, 0.012, 0.024, (0, 0.105, 0.094), wm['gunmetal'], verts=14))
    awm.append(part_cyl("AWM_WindTurret", 0.011, 0.011, 0.022, (0.026, 0.105, 0.070), wm['gunmetal'], verts=14, rot=(0, math.pi / 2, 0)))
    awm.append(part_box("AWM_Mag", (0.036, 0.095, 0.065), (0, 0.115, -0.052), wm['dark'], bevel=0.003))
    # Swept Bolt Handle + Spherical Bolt Knob
    awm.append(part_cyl("AWM_BoltArm", 0.0055, 0.0055, 0.048, (0.036, 0.018, 0.018), wm['chrome'], verts=10, rot=(0, math.radians(102), 0)))
    awm.append(part_sphere("AWM_BoltBall", 0.012, (0.058, 0.018, 0.008), wm['dark']))
    objs['awm'] = join_parts("Weapon_AWM", awm)

    # ---- 4) ULTRA-REFINED BARRETT M82A1 .50 BMG (巴雷特毁灭大炮精修版) ----
    bar = []
    bar.append(part_box("BAR_Upper", (0.068, 0.65, 0.058), (0, 0.18, 0.014), wm['gunmetal'], bevel=0.007))
    bar.append(part_box("BAR_Lower", (0.062, 0.44, 0.044), (0, 0.09, -0.028), wm['dark'], bevel=0.005))
    for v in range(9):
        bar.append(part_box(f"BAR_CoolSlot_{v}", (0.072, 0.026, 0.022), (0, 0.22 + v * 0.032, 0.016), wm['dark'], bevel=0.002))
    bar.append(part_cyl("BAR_HeavyBarrel", 0.016, 0.020, 0.46, (0, 0.68, 0.014), wm['gunmetal'], verts=20, rot=(math.pi / 2, 0, 0)))
    # Signature V-Shaped Dual-Chamber Arrowhead .50 BMG Muzzle Brake!
    bar.append(part_box("BAR_BrakeCore", (0.042, 0.092, 0.044), (0, 0.91, 0.014), wm['dark'], bevel=0.004))
    for sx in [-1, 1]:
        for ch in [0, 0.038]:
            bar.append(part_box(
                f"BAR_Baffle_{sx}_{ch}", (0.046, 0.016, 0.046),
                (sx * 0.026, 0.885 + ch, 0.014), wm['gunmetal'],
                rot=(0, 0, sx * math.radians(32)), bevel=0.003
            ))
    bar.append(part_box("BAR_CarryHandle", (0.018, 0.11, 0.038), (0.038, 0.22, 0.052), wm['dark'], bevel=0.003))
    bar.append(part_cyl("BAR_Scope", 0.021, 0.021, 0.32, (0, 0.15, 0.084), wm['dark'], verts=22, rot=(math.pi / 2, 0, 0)))
    bar.append(part_cyl("BAR_ObjBell", 0.032, 0.021, 0.09, (0, 0.33, 0.084), wm['dark'], verts=22, rot=(math.pi / 2, 0, 0)))
    bar.append(part_cyl("BAR_LensRear", 0.020, 0.020, 0.006, (0, -0.012, 0.084), wm['lens'], verts=22, rot=(math.pi / 2, 0, 0)))
    bar.append(part_box("BAR_50Mag", (0.044, 0.125, 0.165), (0, 0.18, -0.115), wm['gunmetal'], rot=(math.radians(-12), 0, 0), bevel=0.005))
    bar.append(part_box("BAR_Grip", (0.034, 0.048, 0.108), (0, -0.02, -0.084), wm['dark'], rot=(math.radians(-24), 0, 0), bevel=0.005))
    bar.append(part_box("BAR_Stock", (0.058, 0.18, 0.115), (0, -0.21, -0.018), wm['dark'], bevel=0.006))
    objs['barrett'] = join_parts("Weapon_Barrett", bar)

    # ---- 5) ULTRA-REFINED DESERT EAGLE .50 AE (银色拉丝沙漠之鹰精修版) ----
    dg = []
    dg.append(part_box("DG_Slide", (0.042, 0.22, 0.042), (0, 0.185, 0.026), wm['chrome'], bevel=0.007))
    dg.append(part_box("DG_Frame", (0.038, 0.21, 0.024), (0, 0.17, 0.000), wm['chrome'], bevel=0.004))
    dg.append(part_box("DG_TopRail", (0.020, 0.19, 0.010), (0, 0.19, 0.048), wm['dark'], bevel=0.002))
    for s_i in range(6):
        dg.append(part_box(f"DG_Serr_{s_i}", (0.043, 0.005, 0.028), (0, 0.085 + s_i * 0.009, 0.024), wm['dark'], bevel=0.001))
    dg.append(part_cyl("DG_Bore", 0.0095, 0.0095, 0.02, (0, 0.292, 0.028), wm['dark'], verts=14, rot=(math.pi / 2, 0, 0)))
    dg.append(part_box("DG_Hammer", (0.010, 0.022, 0.022), (0, 0.068, 0.026), wm['dark'], rot=(math.radians(28), 0, 0), bevel=0.002))
    dg.append(part_box("DG_Grip", (0.035, 0.056, 0.118), (0, 0.088, -0.055), wm['dark'], rot=(math.radians(-20), 0, 0), bevel=0.007))
    dg.append(part_box("DG_MagBase", (0.038, 0.062, 0.014), (0, 0.066, -0.114), wm['chrome'], rot=(math.radians(-20), 0, 0), bevel=0.003))
    dg.append(part_box("DG_TrigGuard", (0.014, 0.056, 0.028), (0, 0.145, -0.022), wm['chrome'], bevel=0.003))
    objs['deagle'] = join_parts("Weapon_Deagle", dg)

    # ---- 6) ULTRA-REFINED NEPALESE KUKRI (尼泊尔军刀精锻版) ----
    kk = []
    kk.append(part_cyl("KK_Grip", 0.016, 0.019, 0.135, (0.02, 0.14, -0.05), wm['walnut'], verts=18, rot=(math.radians(-20), 0, 0), bevel=0.004))
    for rg in [-0.02, 0.02]:
        kk.append(part_cyl(f"KK_GripRing_{rg}", 0.0185, 0.0185, 0.006, (0.02, 0.14 - rg * 0.34, -0.05 + rg * 0.94), wm['bright_gold'], verts=18, rot=(math.radians(-20), 0, 0)))
    kk.append(part_cyl("KK_Pommel", 0.025, 0.018, 0.024, (0.02, 0.116, -0.114), wm['kirin_gold'], verts=18, rot=(math.radians(-20), 0, 0), bevel=0.004))
    kk.append(part_box("KK_Bolster", (0.046, 0.036, 0.020), (0.02, 0.172, 0.014), wm['kirin_gold'], bevel=0.005))

    # Smooth Multi-Slice Lofted Curved Kukri Blade with Razor Bevel!
    bm_k = bmesh.new()
    # Spine & Edge profile points (y, z, half_thickness)
    slices = [
        (0.175, 0.025, 0.205, 0.025, 0.0045),
        (0.185, 0.068, 0.222, 0.062, 0.0045),
        (0.202, 0.118, 0.252, 0.105, 0.0042),
        (0.230, 0.172, 0.288, 0.148, 0.0038),
        (0.268, 0.222, 0.320, 0.192, 0.0030),
        (0.308, 0.258, 0.335, 0.235, 0.0020),
        (0.342, 0.278, 0.344, 0.274, 0.0006),
    ]
    k_rings = []
    for (sy, sz, ey, ez, th) in slices:
        my, mz = (sy * 0.35 + ey * 0.65), (sz * 0.35 + ez * 0.65)
        v_spine = bm_k.verts.new((0.02, sy, sz))
        v_left = bm_k.verts.new((0.02 - th, my, mz))
        v_edge = bm_k.verts.new((0.02, ey, ez))
        v_right = bm_k.verts.new((0.02 + th, my, mz))
        k_rings.append([v_spine, v_left, v_edge, v_right])
    for r in range(len(k_rings) - 1):
        r0, r1 = k_rings[r], k_rings[r + 1]
        for i in range(4):
            ni = (i + 1) % 4
            f = bm_k.faces.new([r0[i], r0[ni], r1[ni], r1[i]])
            f.smooth = True
    bm_k.faces.new(list(reversed(k_rings[0])))
    bm_k.faces.new(k_rings[-1])
    km = bpy.data.meshes.new("KK_Blade_m")
    bm_k.normal_update()
    bm_k.to_mesh(km)
    bm_k.free()
    k_blade = bpy.data.objects.new("KK_Blade", km)
    bpy.context.collection.objects.link(k_blade)
    k_blade.data.materials.append(wm['chrome'])
    box_uv(k_blade)
    kk.append(k_blade)
    objs['kukri'] = join_parts("Weapon_Kukri", kk)

    # ---- 7) ULTRA-REFINED HE FRAG GRENADE (高爆手雷精修版) ----
    gr = []
    gr.append(part_sphere("GR_Canister", 0.046, (0, 0.18, -0.008), wm['olive'], scale=(0.95, 0.95, 1.28)))
    gr.append(part_cyl("GR_StencilBand", 0.045, 0.045, 0.020, (0, 0.18, 0.006), wm['red'], verts=24, bevel=0.002))
    gr.append(part_cyl("GR_Neck", 0.020, 0.024, 0.026, (0, 0.18, 0.056), wm['gunmetal'], verts=16))
    gr.append(part_box("GR_FuzeHead", (0.032, 0.028, 0.022), (0, 0.18, 0.072), wm['chrome'], bevel=0.004))
    gr.append(part_box("GR_SpoonTop", (0.016, 0.044, 0.012), (0.020, 0.18, 0.076), wm['dark'], bevel=0.002))
    gr.append(part_box("GR_SpoonSide", (0.014, 0.016, 0.095), (0.044, 0.18, 0.024), wm['dark'], rot=(0, math.radians(-10), 0), bevel=0.002))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.018, minor_radius=0.003, major_segments=20, minor_segments=8, location=(-0.024, 0.18, 0.070), rotation=(math.pi / 2, 0, 0))
    ring = bpy.context.active_object
    ring.data.materials.append(wm['chrome'])
    box_uv(ring)
    gr.append(ring)
    objs['he_grenade'] = join_parts("Weapon_Grenade", gr)

    return objs


def setup_studio_environment_and_render(filepath, cam_loc, cam_target, lens=38, res_x=1360, res_y=880):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 44
    scene.cycles.use_denoising = False
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.image_settings.file_format = 'PNG'

    # Bright Studio Reflection Environment so gunmetal, chrome & tactical gear pop crisply!
    world = bpy.data.worlds.new("StudioWorld")
    scene.world = world
    w_nt = world.node_tree
    bg = w_nt.nodes.get("Background") or w_nt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.14, 0.18, 0.24, 1.0)
    bg.inputs[1].default_value = 1.65

    def add_area(name, loc, target, energy, size, color):
        ld = bpy.data.lights.new(name=name, type='AREA')
        ld.energy = energy
        ld.size = size
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        bpy.context.collection.objects.link(lo)
        lo.location = Vector(loc)
        lo.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

    add_area("KeyLight", (2.2, 3.4, 2.8), (0, 0, 0.8), 420, 3.2, (1.0, 0.95, 0.88))
    add_area("FillLight", (-2.4, 3.2, 1.8), (0, 0, 0.8), 280, 3.5, (0.82, 0.90, 1.0))
    add_area("TopSoftbox", (0.0, 1.2, 3.8), (0, 0, 0.4), 320, 4.0, (0.95, 0.97, 1.0))
    add_area("RimLight", (-1.8, -2.5, 2.4), (0, 0, 1.0), 260, 2.5, (0.48, 0.76, 1.0))

    cam_data = bpy.data.cameras.new("StudioCam")
    cam_data.lens = lens
    cam_obj = bpy.data.objects.new("StudioCam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = Vector(cam_loc)
    direction = Vector(cam_target) - Vector(cam_loc)
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam_obj

    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)
    print(f"Studio Render Saved: {filepath}")


def export_soldiers_and_render_showcase():
    reset_scene()
    cm = create_character_materials(with_textures=True)
    wm = create_weapon_materials(with_textures=True)

    gr_parts = build_soldier_faction("GR", True, cm)
    bl_parts = build_soldier_faction("BL", False, cm)
    weps = build_v2_weapons(wm)
    for wid, wobj in weps.items():
        wobj.hide_render = True

    def pose_soldier(parts_tuple, x_pos, yaw_deg, gun_obj):
        torso, head, arm_r, arm_l, leg_l, leg_r = parts_tuple
        root = bpy.data.objects.new("PoseRoot", None)
        bpy.context.collection.objects.link(root)
        root.location = (x_pos, 0, 0)
        root.rotation_euler = (0, 0, math.radians(yaw_deg))

        torso.parent = root
        head.parent = root
        head.location = (0, 0, 1.48)
        arm_r.parent = root
        arm_r.location = (0.235, 0, 1.39)
        arm_l.parent = root
        arm_l.location = (-0.235, 0, 1.39)
        leg_l.parent = root
        leg_l.location = (-0.12, 0, 0.78)
        leg_l.rotation_euler = (math.radians(5), 0, math.radians(-3))
        leg_r.parent = root
        leg_r.location = (0.12, 0, 0.78)
        leg_r.rotation_euler = (math.radians(-5), 0, math.radians(3))

        gun_copy = gun_obj.copy()
        gun_copy.data = gun_obj.data
        gun_copy.hide_render = False
        bpy.context.collection.objects.link(gun_copy)
        gun_copy.parent = arm_r
        gun_copy.scale = (1.08, 1.08, 1.08)
        gun_copy.location = (-0.09, 0.18, -0.17)

    pose_soldier(gr_parts, -0.62, 24, weps['m4a1s'])
    pose_soldier(bl_parts, 0.62, -24, weps['ak47'])

    ped_mat = make_pbr_mat("PedestalMat", (0.12, 0.15, 0.19, 1.0), 0.55, 0.36, 'deck_steel.jpg', 0.25)
    ring_mat = make_pbr_mat("PedestalRing", (0.95, 0.68, 0.15, 1.0), 0.85, 0.22)
    part_cyl("Pedestal", 2.1, 2.2, 0.08, (0, 0, -0.04), ped_mat, verts=48, uv_scale=1.2)
    bpy.ops.mesh.primitive_torus_add(major_radius=1.65, minor_radius=0.022, major_segments=56, minor_segments=12, location=(0, 0, 0.01))
    tr = bpy.context.active_object
    tr.data.materials.append(ring_mat)

    char_render_path = os.path.join(ARTIFACT_DIR, "cf_characters_studio_render.png")
    setup_studio_environment_and_render(char_render_path, cam_loc=(0.0, 4.35, 1.08), cam_target=(0.0, 0.0, 0.90), lens=38)

    reset_scene()
    cm_glb = create_character_materials(with_textures=False)
    build_soldier_faction("GR", True, cm_glb)
    build_soldier_faction("BL", False, cm_glb)
    build_fps_5finger_hand_and_forearm("FPS_ArmL_GR", True, True, cm_glb)
    build_fps_5finger_hand_and_forearm("FPS_ArmR_GR", False, True, cm_glb)
    build_fps_5finger_hand_and_forearm("FPS_ArmL_BL", True, False, cm_glb)
    build_fps_5finger_hand_and_forearm("FPS_ArmR_BL", False, False, cm_glb)
    strip_material_images_for_lightweight_glb()

    soldiers_glb = os.path.join(MODEL_DIR, "soldiers_highpoly.glb")
    bpy.ops.export_scene.gltf(filepath=soldiers_glb, export_format='GLB', export_yup=True, export_apply=True)
    print(f"Exported Soldiers GLB: {soldiers_glb} ({os.path.getsize(soldiers_glb)} bytes)")


def export_v2_weapons_and_render_showcase():
    reset_scene()
    wm = create_weapon_materials(with_textures=True)
    weps = build_v2_weapons(wm)

    # Spacious 3-Row Gunsmith Showcase Wall — full side profile facing +Y camera!
    # Rotating Z by -90 deg puts +Y_b (barrel) pointing RIGHT (+X), and +Z_b (gun top) pointing UP (+Z)!
    layout = [
        ('ak47',       ( 0.56, 0.08,  0.66), (math.radians(6), 0, math.radians(84)), 1.25),
        ('m4a1s',      (-0.56, 0.08,  0.66), (math.radians(6), 0, math.radians(84)), 1.25),
        ('awm',        ( 0.54, 0.08,  0.22), (math.radians(6), 0, math.radians(85)), 1.12),
        ('barrett',    (-0.62, 0.08,  0.22), (math.radians(6), 0, math.radians(85)), 1.04),
        ('deagle',     ( 0.62, 0.12, -0.26), (math.radians(8), 0, math.radians(82)), 1.80),
        ('kukri',      ( 0.00, 0.12, -0.36), (math.radians(62), 0, math.radians(82)), 1.60),
        ('he_grenade', (-0.64, 0.12, -0.22), (math.radians(14), 0, math.radians(-28)), 2.25),
    ]
    for wid, loc, rot, sc in layout:
        o = weps[wid]
        o.location = loc
        o.rotation_euler = rot
        o.scale = (sc, sc, sc)

    wall_mat = make_pbr_mat("RackWall", (0.16, 0.20, 0.25, 1.0), 0.35, 0.55, 'deck_steel.jpg', 0.2)
    part_box("GunsmithBackdrop", (3.6, 0.08, 2.2), (0, -0.18, 0.22), wall_mat, bevel=0.01, uv_scale=1.2)

    wep_render_path = os.path.join(ARTIFACT_DIR, "cf_weapons_v2_studio_render.png")
    setup_studio_environment_and_render(wep_render_path, cam_loc=(0.0, 2.95, 0.24), cam_target=(0.0, 0.0, 0.22), lens=36)

    # Step B: Reset transforms & export clean V2 weapons_arsenal.glb for Game Engine!
    reset_scene()
    wm_glb = create_weapon_materials(with_textures=False)
    build_v2_weapons(wm_glb)
    strip_material_images_for_lightweight_glb()

    wep_glb = os.path.join(MODEL_DIR, "weapons_arsenal.glb")
    bpy.ops.export_scene.gltf(filepath=wep_glb, export_format='GLB', export_yup=True, export_apply=True)
    print(f"Exported V2 Weapons GLB: {wep_glb} ({os.path.getsize(wep_glb)} bytes)")


if __name__ == "__main__":
    export_soldiers_and_render_showcase()
    export_v2_weapons_and_render_showcase()
    print("V2 CHARACTERS + WEAPONS + STUDIO RENDERS COMPLETED SUCCESSFULLY!")
