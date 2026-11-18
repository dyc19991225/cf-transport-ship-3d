import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

OUT_DIR = r"e:\ai\cf-transport-ship-3d\public\models"
os.makedirs(OUT_DIR, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.2, roughness=0.5, emission=None):
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
            bsdf.inputs['Emission Strength'].default_value = 2.5
    return mat


def box_uv_unwrap(obj, scale=1.0):
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop_idx in poly.loop_indices:
            v = mesh.vertices[mesh.loops[loop_idx].vertex_index].co
            if ax >= ay and ax >= az:
                u, w = v.y * scale, v.z * scale
            elif ay >= ax and ay >= az:
                u, w = v.x * scale, v.z * scale
            else:
                u, w = v.x * scale, v.y * scale
            uv_layer[loop_idx].uv = (u, w)


def unit_face_uv_unwrap(obj):
    """Maps each face of a unit [0..1] box cleanly onto [0..1] UV space."""
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop_idx in poly.loop_indices:
            v = mesh.vertices[mesh.loops[loop_idx].vertex_index].co
            if ax >= ay and ax >= az:
                u, w = v.y + 0.5, v.z
            elif ay >= ax and ay >= az:
                u, w = v.x + 0.5, v.z
            else:
                u, w = v.x + 0.5, v.y + 0.5
            uv_layer[loop_idx].uv = (u, w)


def add_bevel(obj, width=0.008, segments=2):
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(32)


def create_box_part(name, size_xyz, loc_xyz, mat, rot_euler=(0, 0, 0), bevel=0.004, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size_xyz, verts=bm.verts)
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc_xyz
    obj.rotation_euler = rot_euler
    obj.data.materials.append(mat)
    box_uv_unwrap(obj, scale=1.5)
    if bevel > 0:
        add_bevel(obj, width=bevel, segments=2)
    if parent:
        obj.parent = parent
    return obj


def create_cyl_part(name, r1, r2, depth, loc_xyz, mat, verts=16, rot_euler=(0, 0, 0), bevel=0.002, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r1, radius2=r2, depth=depth)
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc_xyz
    obj.rotation_euler = rot_euler
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    box_uv_unwrap(obj, scale=2.0)
    if bevel > 0:
        add_bevel(obj, width=bevel, segments=1)
    if parent:
        obj.parent = parent
    return obj


def join_children_into_single_mesh(root_name, parts):
    bpy.ops.object.select_all(action='DESELECT')
    depsgraph = bpy.context.evaluated_depsgraph_get()

    combined_bm = bmesh.new()
    uv_layer = combined_bm.loops.layers.uv.new("UVMap")
    mat_list = []
    mat_index_map = {}

    for obj in parts:
        eval_obj = obj.evaluated_get(depsgraph)
        temp_mesh = bpy.data.meshes.new_from_object(eval_obj)
        temp_mesh.transform(obj.matrix_world)

        # Register materials
        local_to_global_mat = {}
        for idx, m in enumerate(temp_mesh.materials):
            if m.name not in mat_index_map:
                mat_index_map[m.name] = len(mat_list)
                mat_list.append(m)
            local_to_global_mat[idx] = mat_index_map[m.name]

        offset = len(combined_bm.verts)
        for v in temp_mesh.vertices:
            combined_bm.verts.new(v.co)
        combined_bm.verts.ensure_lookup_table()

        src_uv = temp_mesh.uv_layers.active.data if temp_mesh.uv_layers.active else None
        for poly in temp_mesh.polygons:
            p_verts = [combined_bm.verts[offset + vi] for vi in poly.vertices]
            try:
                face = combined_bm.faces.new(p_verts)
                face.smooth = poly.use_smooth
                face.material_index = local_to_global_mat.get(poly.material_index, 0)
                if src_uv:
                    for li, loop in enumerate(face.loops):
                        src_uv_co = src_uv[poly.loop_indices[li]].uv
                        loop[uv_layer].uv = (src_uv_co.x, src_uv_co.y)
            except ValueError:
                pass
        bpy.data.meshes.remove(temp_mesh)

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


def export_glb(filename):
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
    )
    print(f"Exported: {path} ({os.path.getsize(path)} bytes)")


# =============================================================================
# 1. BUILD HIGH-DETAIL WOODEN CRATE (wood_crate.glb)
# Normalized [X: -0.5..0.5, Y_b: -0.5..0.5, Z_b: 0..1.0]
# =============================================================================
def build_wood_crate():
    reset_scene()
    mat_plank = make_mat("MAT_CRATE_WOOD", (1.0, 1.0, 1.0, 1.0), metallic=0.04, roughness=0.82)
    mat_frame = make_mat("MAT_CRATE_FRAME", (0.86, 0.78, 0.68, 1.0), metallic=0.05, roughness=0.80)
    mat_iron = make_mat("MAT_CRATE_IRON", (0.18, 0.19, 0.21, 1.0), metallic=0.82, roughness=0.38)

    parts = []
    # Recessed inner wooden plank box (mapped 0..1 per face for AI wood_crate.jpg!)
    core = create_box_part("Core", (0.93, 0.93, 0.93), (0, 0, 0.5), mat_plank, bevel=0.004)
    unit_face_uv_unwrap(core)
    parts.append(core)

    # 12 Outer 3D Timber Frame Rails
    t = 0.085
    d = 0.042
    # Vertical corner stiles
    for sx in [-1, 1]:
        for sy in [-1, 1]:
            parts.append(create_box_part(
                f"Stile_{sx}_{sy}", (t, t, 1.0),
                (sx * (0.5 - t / 2), sy * (0.5 - t / 2), 0.5),
                mat_frame, bevel=0.006
            ))
            # Top & bottom forged iron corner brackets
            for sz, zc in [(-1, 0.055), (1, 0.945)]:
                parts.append(create_box_part(
                    f"Iron_{sx}_{sy}_{sz}", (0.12, 0.12, 0.11),
                    (sx * 0.445, sy * 0.445, zc),
                    mat_iron, bevel=0.005
                ))

    # Horizontal top & bottom rails along X and Y
    for zc in [t / 2, 1.0 - t / 2]:
        for sy in [-1, 1]:
            parts.append(create_box_part(
                f"RailX_{sy}_{zc}", (1.0 - 2 * t, d, t),
                (0, sy * (0.5 - d / 2), zc), mat_frame, bevel=0.005
            ))
        for sx in [-1, 1]:
            parts.append(create_box_part(
                f"RailY_{sx}_{zc}", (d, 1.0 - 2 * t, t),
                (sx * (0.5 - d / 2), 0, zc), mat_frame, bevel=0.005
            ))

    # 3D Diagonal Cross-Braces on all 4 vertical faces + top lid
    diag_len = 1.14
    for sy in [-1, 1]:
        parts.append(create_box_part(
            f"DiagFB_{sy}", (0.075, 0.032, diag_len),
            (0, sy * 0.478, 0.5), mat_frame,
            rot_euler=(0, sy * math.pi / 4, 0), bevel=0.004
        ))
    for sx in [-1, 1]:
        parts.append(create_box_part(
            f"DiagLR_{sx}", (0.032, 0.075, diag_len),
            (sx * 0.478, 0, 0.5), mat_frame,
            rot_euler=(sx * math.pi / 4, 0, 0), bevel=0.004
        ))
    parts.append(create_box_part(
        "DiagTop", (0.075, diag_len, 0.03),
        (0, 0, 0.98), mat_frame,
        rot_euler=(0, 0, math.pi / 4), bevel=0.004
    ))

    join_children_into_single_mesh("WoodCrate", parts)
    export_glb("wood_crate.glb")


# =============================================================================
# 2. BUILD HIGH-DETAIL ISO SHIPPING CONTAINER (container_iso.glb)
# Built at real 2.5m x 6.0m x 2.65m then normalized to 1.0 x 1.0 x 1.0 (Z_b: 0..1)
# =============================================================================
def create_corrugated_panel(name, length_y, height_z, x_pos, sign_x, mat):
    """Creates a true 3D trapezoidal corrugated steel wall mesh along Y."""
    bm = bmesh.new()
    waves = 22
    dy = length_y / (waves * 4)
    y0 = -length_y / 2
    z0 = 0.12
    z1 = height_z - 0.12
    amp = 0.032 * sign_x

    prev_b = None
    prev_t = None
    for i in range(waves * 4 + 1):
        phase = i % 4
        dx = amp if phase in (1, 2) else -amp
        y = y0 + i * dy
        vb = bm.verts.new((x_pos + dx, y, z0))
        vt = bm.verts.new((x_pos + dx, y, z1))
        if prev_b is not None:
            face = bm.faces.new([prev_b, vb, vt, prev_t]) if sign_x > 0 else bm.faces.new([vb, prev_b, prev_t, vt])
            face.smooth = False
        prev_b, prev_t = vb, vt

    mesh = bpy.data.meshes.new(name + "_mesh")
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    # Clean planar UV [0..2, 0..1] for corrugated AI texture
    mesh.uv_layers.new(name="UVMap")
    uv = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            uv[li].uv = ((co.y / length_y + 0.5) * 2.0, (co.z - z0) / (z1 - z0))
    return obj


def build_iso_container():
    reset_scene()
    W, L, H = 2.5, 6.0, 2.65
    mat_panel = make_mat("MAT_CONTAINER_PANEL", (1.0, 1.0, 1.0, 1.0), metallic=0.35, roughness=0.52)
    mat_door = make_mat("MAT_CONTAINER_DOOR", (0.95, 0.95, 0.95, 1.0), metallic=0.38, roughness=0.50)
    mat_frame = make_mat("MAT_CONTAINER_FRAME", (0.72, 0.72, 0.72, 1.0), metallic=0.45, roughness=0.48)
    mat_chrome = make_mat("MAT_LOCK_ROD", (0.82, 0.85, 0.88, 1.0), metallic=0.92, roughness=0.24)
    mat_seal = make_mat("MAT_DOOR_SEAL", (0.08, 0.09, 0.10, 1.0), metallic=0.1, roughness=0.85)

    parts = []
    # Solid inner dark core to prevent any light leaks between ribs
    parts.append(create_box_part("InnerSeal", (W - 0.12, L - 0.12, H - 0.08), (0, 0, H / 2), mat_frame, bevel=0))

    # True 3D corrugated left & right steel walls
    parts.append(create_corrugated_panel("SidePosX", L - 0.28, H, W / 2 - 0.04, 1, mat_panel))
    parts.append(create_corrugated_panel("SideNegX", L - 0.28, H, -W / 2 + 0.04, -1, mat_panel))

    # Roof corrugated ribs
    parts.append(create_box_part("RoofPlate", (W - 0.16, L - 0.16, 0.06), (0, 0, H - 0.05), mat_panel, bevel=0.004))
    for i in range(16):
        ry = -L / 2 + 0.35 + i * ((L - 0.7) / 15)
        parts.append(create_box_part(f"RoofRib_{i}", (W - 0.28, 0.14, 0.03), (0, ry, H - 0.015), mat_panel, bevel=0.003))

    # 4 Vertical Corner Posts + 8 ISO Corner Castings
    post_w = 0.15
    for sx in [-1, 1]:
        for sy in [-1, 1]:
            px = sx * (W / 2 - post_w / 2)
            py = sy * (L / 2 - post_w / 2)
            parts.append(create_box_part(f"Post_{sx}_{sy}", (post_w, post_w, H), (px, py, H / 2), mat_frame, bevel=0.008))
            for zc in [0.09, H - 0.09]:
                parts.append(create_box_part(f"Casting_{sx}_{sy}_{zc}", (0.18, 0.18, 0.18), (px, py, zc), mat_frame, bevel=0.01))

    # Top & Bottom Longitudinal & Transverse Structural Rails
    for zc in [0.07, H - 0.07]:
        for sx in [-1, 1]:
            parts.append(create_box_part(f"LongRail_{sx}_{zc}", (0.13, L - 0.24, 0.14), (sx * (W / 2 - 0.065), 0, zc), mat_frame, bevel=0.006))
        for sy in [-1, 1]:
            parts.append(create_box_part(f"EndRail_{sy}_{zc}", (W - 0.24, 0.13, 0.14), (0, sy * (L / 2 - 0.065), zc), mat_frame, bevel=0.006))

    # Recessed Double Cargo Doors at both ends (+Y and -Y) with 3D Galvanized Locking Rods & Handles!
    for sy in [-1, 1]:
        dy = sy * (L / 2 - 0.055)
        door_plate = create_box_part(f"DoorFace_{sy}", (W - 0.28, 0.04, H - 0.26), (0, dy, H / 2), mat_door, bevel=0.003)
        parts.append(door_plate)
        # Center rubber gasket seam
        parts.append(create_box_part(f"Gasket_{sy}", (0.04, 0.055, H - 0.26), (0, dy + sy * 0.01, H / 2), mat_seal, bevel=0.002))
        # 4 Vertical Cylindrical Galvanized Steel Locking Bars + Cam Latches + Handles at Y=1.45m
        for bx in [-0.72, -0.28, 0.28, 0.72]:
            parts.append(create_cyl_part(
                f"LockRod_{sy}_{bx}", 0.022, 0.022, H - 0.30,
                (bx, dy + sy * 0.042, H / 2), mat_chrome, verts=10, bevel=0
            ))
            # Handle lever at headshot/chest height
            parts.append(create_box_part(
                f"Latch_{sy}_{bx}", (0.14, 0.04, 0.045),
                (bx + 0.05, dy + sy * 0.058, 1.38), mat_chrome, bevel=0.004
            ))

    merged = join_children_into_single_mesh("ISOContainer", parts)
    # Normalize to exact 1.0 x 1.0 x 1.0 (X: -0.5..0.5, Y_b: -0.5..0.5, Z_b: 0..1.0)
    for v in merged.data.vertices:
        v.co.x /= W
        v.co.y /= L
        v.co.z /= H
    merged.data.update()
    export_glb("container_iso.glb")


# =============================================================================
# 3. BUILD ICONIC HOLLOW WALKTHROUGH RED CONTAINER (container_hollow.glb)
# Exact world dimensions: X=3.16m, Z_three=12.4m (Y_b=12.4m), Y_three=2.68m (Z_b=2.68m)
# =============================================================================
def build_hollow_container():
    reset_scene()
    W, L, H = 3.16, 12.4, 2.68
    mat_red = make_mat("MAT_HOLLOW_RED", (1.0, 1.0, 1.0, 1.0), metallic=0.36, roughness=0.50)
    mat_frame = make_mat("MAT_HOLLOW_FRAME", (0.48, 0.14, 0.12, 1.0), metallic=0.45, roughness=0.48)
    mat_floor = make_mat("MAT_HOLLOW_FLOOR", (0.72, 0.56, 0.38, 1.0), metallic=0.05, roughness=0.85)
    mat_chrome = make_mat("MAT_LOCK_ROD", (0.82, 0.85, 0.88, 1.0), metallic=0.92, roughness=0.24)

    parts = []
    # Wooden interior cargo deck floor (Z_b = 0..0.10)
    parts.append(create_box_part("Floor", (W, L, 0.10), (0, 0, 0.05), mat_floor, bevel=0.005))

    # Left & Right 0.18m thick walls with exterior & interior 3D corrugation!
    for sx in [-1, 1]:
        wx = sx * 1.49
        parts.append(create_box_part(f"WallCore_{sx}", (0.12, L, 2.44), (wx, 0, 1.32), mat_frame, bevel=0.004))
        parts.append(create_corrugated_panel(f"ExtCorr_{sx}", L - 0.24, H, wx + sx * 0.055, sx, mat_red))
        parts.append(create_corrugated_panel(f"IntCorr_{sx}", L - 0.24, H - 0.08, wx - sx * 0.055, -sx, mat_red))

    # Roof slab (Z_b = 2.54..2.68) + interior ceiling cross-ribs
    parts.append(create_box_part("Roof", (W, L, 0.14), (0, 0, 2.61), mat_red, bevel=0.008))
    for i in range(11):
        ry = -5.5 + i * 1.1
        parts.append(create_box_part(f"CeilingBeam_{i}", (W - 0.36, 0.10, 0.05), (0, ry, 2.52), mat_frame, bevel=0.003))

    # Corner posts at open portals
    for sx in [-1, 1]:
        for sy in [-1, 1]:
            parts.append(create_box_part(
                f"PortalPost_{sx}_{sy}", (0.18, 0.18, H),
                (sx * 1.49, sy * (L / 2 - 0.09), H / 2), mat_frame, bevel=0.008
            ))

    # Two swung-open cargo doors matching physics colliders at Z_three = sz*6.85 -> Y_b = -sz*6.85, X = sz*1.45
    for sz in [1, -1]:
        dx = sz * 1.45
        dy = -sz * 6.85
        parts.append(create_box_part(f"OpenDoor_{sz}", (0.14, 1.35, 2.52), (dx, dy, 1.31), mat_red, bevel=0.006))
        for ry_off in [-0.38, 0.38]:
            parts.append(create_cyl_part(
                f"OpenDoorRod_{sz}_{ry_off}", 0.02, 0.02, 2.38,
                (dx + sz * 0.08, dy + ry_off, 1.31), mat_chrome, verts=10, bevel=0
            ))

    join_children_into_single_mesh("HollowContainer", parts)
    export_glb("container_hollow.glb")


# =============================================================================
# 4. BUILD MARITIME SHIP STRUCTURES & PROPS (ship_structures.glb)
# =============================================================================
def build_ship_structures():
    reset_scene()
    mat_yellow = make_mat("MAT_CRANE_YELLOW", (0.88, 0.62, 0.12, 1.0), metallic=0.48, roughness=0.42)
    mat_dark = make_mat("MAT_DARK_STEEL", (0.15, 0.18, 0.22, 1.0), metallic=0.68, roughness=0.45)
    mat_white = make_mat("MAT_BRIDGE_WHITE", (0.88, 0.91, 0.94, 1.0), metallic=0.18, roughness=0.46)
    mat_glass = make_mat("MAT_BRIDGE_GLASS", (0.06, 0.16, 0.26, 1.0), metallic=0.92, roughness=0.08)
    mat_red = make_mat("MAT_HULL_RED", (0.58, 0.14, 0.12, 1.0), metallic=0.36, roughness=0.56)
    mat_orange = make_mat("MAT_LIFEBUOY", (0.94, 0.32, 0.08, 1.0), metallic=0.1, roughness=0.42)
    mat_pipe_red = make_mat("MAT_FIRE_PIPE", (0.68, 0.15, 0.12, 1.0), metallic=0.55, roughness=0.38)
    mat_lamp = make_mat("MAT_LAMP_GLOW", (1.0, 0.72, 0.25, 1.0), metallic=0.1, roughness=0.2, emission=(1.0, 0.68, 0.2))

    # --- Object 1: GantryCrane (centered at Y_b=0, spans X=±17.3, height Z_b=0..18.5) ---
    crane_parts = []
    for sx in [-1, 1]:
        lx = sx * 17.3
        # Twin H-beam legs per side + X-truss diagonal bracing!
        for yo in [-0.65, 0.65]:
            crane_parts.append(create_box_part(f"Leg_{sx}_{yo}", (0.55, 0.55, 17.2), (lx, yo, 8.6), mat_yellow, bevel=0.02))
        for tier in range(5):
            zt = 1.8 + tier * 3.1
            crane_parts.append(create_box_part(f"Strut_{sx}_{tier}", (0.35, 1.3, 0.28), (lx, 0, zt), mat_yellow, bevel=0.01))
            crane_parts.append(create_box_part(
                f"Brace_{sx}_{tier}", (0.24, 0.24, 3.3), (lx, 0, zt + 1.55),
                mat_yellow, rot_euler=(math.radians(22 if tier % 2 == 0 else -22), 0, 0), bevel=0.01
            ))
    # Twin upper bridge girders + upper safety rails
    for yo in [-0.7, 0.7]:
        crane_parts.append(create_box_part(f"Girder_{yo}", (37.4, 0.55, 1.25), (0, yo, 17.0), mat_yellow, bevel=0.02))
    crane_parts.append(create_box_part("TopWalkway", (37.2, 1.95, 0.16), (0, 0, 17.65), mat_dark, bevel=0.01))
    for yo in [-0.95, 0.95]:
        crane_parts.append(create_box_part(f"TopRail_{yo}", (37.2, 0.08, 0.95), (0, yo, 18.2), mat_yellow, bevel=0.005))

    # Trolley + Operator Glass Cab + Wire Cables + Spreader Beam
    crane_parts.append(create_box_part("Trolley", (3.8, 2.2, 0.85), (4.8, 0, 16.1), mat_dark, bevel=0.02))
    crane_parts.append(create_box_part("CabBody", (1.6, 1.8, 1.7), (6.4, 0.8, 14.9), mat_white, bevel=0.02))
    crane_parts.append(create_box_part("CabGlass", (1.45, 0.12, 1.1), (6.4, 1.68, 14.85), mat_glass, bevel=0.005))
    for cx_off in [3.5, 6.1]:
        for cy_off in [-0.55, 0.55]:
            crane_parts.append(create_cyl_part(
                f"Cable_{cx_off}_{cy_off}", 0.035, 0.035, 4.2,
                (cx_off, cy_off, 13.8), mat_dark, verts=8, bevel=0
            ))
    crane_parts.append(create_box_part("Spreader", (3.6, 1.5, 0.45), (4.8, 0, 11.6), mat_yellow, bevel=0.02))
    join_children_into_single_mesh("GantryCrane", crane_parts)

    # --- Object 2: Lifebuoy (High-segment beveled ring + white bands) ---
    buoy_parts = []
    bpy.ops.mesh.primitive_torus_add(major_radius=0.46, minor_radius=0.13, major_segments=28, minor_segments=14, location=(0, 0, 0))
    torus = bpy.context.active_object
    torus.data.materials.append(mat_orange)
    for p in torus.data.polygons:
        p.use_smooth = True
    box_uv_unwrap(torus)
    buoy_parts.append(torus)
    for ang in [0, math.pi / 2, math.pi, 1.5 * math.pi]:
        bx = math.cos(ang) * 0.46
        by = math.sin(ang) * 0.46
        buoy_parts.append(create_cyl_part(
            f"Band_{ang:.2f}", 0.142, 0.142, 0.13,
            (bx, by, 0), mat_white, verts=14,
            rot_euler=(math.cos(ang) * math.pi / 2, math.sin(ang) * math.pi / 2, 0), bevel=0.004
        ))
    join_children_into_single_mesh("Lifebuoy", buoy_parts)

    # --- Object 3: TunnelPipeSegment (6m modular ceiling/wall pipe & caged lamp cluster) ---
    tun_parts = []
    # Dual overhead steam & fire suppression pipes along Y_b = -3..+3
    tun_parts.append(create_cyl_part("FirePipe", 0.085, 0.085, 6.0, (-1.25, 0, 2.55), mat_pipe_red, verts=12, rot_euler=(math.pi / 2, 0, 0)))
    tun_parts.append(create_cyl_part("SteamPipe", 0.065, 0.065, 6.0, (-1.25, 0, 2.28), mat_dark, verts=12, rot_euler=(math.pi / 2, 0, 0)))
    for fy in [-2.2, 0.0, 2.2]:
        tun_parts.append(create_cyl_part(f"Flange_{fy}", 0.12, 0.12, 0.06, (-1.25, fy, 2.55), mat_dark, verts=12, rot_euler=(math.pi / 2, 0, 0)))
    # Red cast-iron valve wheel
    tun_parts.append(create_cyl_part("ValveWheel", 0.18, 0.18, 0.035, (-1.08, 0.4, 2.28), mat_pipe_red, verts=14, rot_euler=(0, math.pi / 2, 0)))
    # Caged waterproof amber ceiling bulkhead lamp
    tun_parts.append(create_box_part("LampBase", (0.38, 0.64, 0.09), (0, 0, 2.80), mat_dark, bevel=0.008))
    tun_parts.append(create_box_part("LampLens", (0.26, 0.48, 0.11), (0, 0, 2.72), mat_lamp, bevel=0.01))
    join_children_into_single_mesh("TunnelPipeSegment", tun_parts)

    # --- Object 4: BridgeSuperstructure (6-story Maritime Wheelhouse + Lifeboats + Funnel) ---
    # Placed at Three.js Z = +53 -> local origin centered, facing +Y_b (-Z_three = North toward deck!)
    br = []
    # Tiered white accommodation decks
    br.append(create_box_part("Br_Deck1", (29.0, 14.0, 4.5), (0, 0, 2.25), mat_white, bevel=0.06))
    br.append(create_box_part("Br_Deck2", (26.5, 12.2, 4.2), (0, 0.5, 6.6), mat_white, bevel=0.06))
    br.append(create_box_part("Br_Deck3", (24.0, 10.6, 4.0), (0, 1.0, 10.7), mat_white, bevel=0.06))
    # Overhanging Panoramic Navigation Wheelhouse + Bridge Wings
    br.append(create_box_part("Br_Wheelhouse", (33.6, 7.6, 3.6), (0, 2.2, 14.5), mat_white, bevel=0.06))
    br.append(create_box_part("Br_SunVisor", (34.2, 8.4, 0.45), (0, 2.5, 16.45), mat_white, bevel=0.03))
    # Angled dark glass wheelhouse windows & porthole strips
    br.append(create_box_part("Br_MainGlass", (32.2, 0.35, 1.55), (0, 5.95, 14.75), mat_glass, bevel=0.01))
    for z_win, w_win, y_win in [(2.8, 25.0, 7.02), (6.9, 22.8, 6.62), (10.9, 20.4, 6.32)]:
        br.append(create_box_part(f"Br_Win_{z_win}", (w_win, 0.25, 0.85), (0, y_win, z_win), mat_glass, bevel=0.01))
    # Twin Orange Enclosed Free-Fall / Davit Lifeboats on Port & Starboard
    for sx in [-1, 1]:
        br.append(create_cyl_part(f"Lifeboat_{sx}", 1.15, 0.85, 6.8, (sx * 14.8, -0.5, 6.8), mat_orange, verts=16, rot_euler=(math.pi / 2, 0, 0), bevel=0.05))
        for dy in [-2.2, 2.2]:
            br.append(create_box_part(f"Davit_{sx}_{dy}", (1.4, 0.35, 2.4), (sx * 13.8, -0.5 + dy, 6.2), mat_yellow, bevel=0.02))
    # Tapered Red & Black Smokestack Funnel + Dual Exhaust Pipes
    br.append(create_cyl_part("FunnelBody", 2.7, 2.0, 8.2, (0, -3.2, 20.2), mat_red, verts=20, bevel=0.04))
    br.append(create_cyl_part("FunnelCasing", 2.08, 1.98, 1.8, (0, -3.2, 24.4), mat_dark, verts=20, bevel=0.03))
    for ex in [-0.65, 0.65]:
        br.append(create_cyl_part(f"Exhaust_{ex}", 0.42, 0.42, 1.6, (ex, -3.2, 25.6), mat_dark, verts=14, bevel=0.01))
    # Radar Mast Tower
    br.append(create_cyl_part("RadarMast", 0.48, 0.22, 6.2, (0, 2.4, 19.6), mat_white, verts=12, bevel=0.01))
    join_children_into_single_mesh("BridgeSuperstructure", br)

    # --- Object 5: ForecastleBow (Sculpted Flat-Topped Forecastle Deck + Twin Anchors + Windlasses + Mast) ---
    bow = []
    # Tapered flat-deck ship prow (+Y_b points toward North sea horizon = -Z_three!)
    bm_bow = bmesh.new()
    # Bottom keel & top forecastle deck polygon vertices (x, y, z)
    top_pts = [(-18.2, 0, 0.8), (18.2, 0, 0.8), (12.5, 14.0, 1.1), (2.2, 29.0, 1.5), (-2.2, 29.0, 1.5), (-12.5, 14.0, 1.1)]
    bot_pts = [(-17.2, 0, -5.6), (17.2, 0, -5.6), (9.5, 13.0, -5.4), (0.8, 25.5, -5.2), (-0.8, 25.5, -5.2), (-9.5, 13.0, -5.4)]
    tv = [bm_bow.verts.new(p) for p in top_pts]
    bv = [bm_bow.verts.new(p) for p in bot_pts]
    bm_bow.faces.new(tv)
    bm_bow.faces.new(list(reversed(bv)))
    for i in range(len(tv)):
        ni = (i + 1) % len(tv)
        bm_bow.faces.new([bv[i], bv[ni], tv[ni], tv[i]])
    bow_mesh = bpy.data.meshes.new("BowHull_mesh")
    bm_bow.normal_update()
    bm_bow.to_mesh(bow_mesh)
    bm_bow.free()
    bow_obj = bpy.data.objects.new("BowHull", bow_mesh)
    bpy.context.collection.objects.link(bow_obj)
    bow_obj.data.materials.append(mat_red)
    box_uv_unwrap(bow_obj, scale=0.2)
    bow.append(bow_obj)

    # Twin Hydraulic Anchor Windlasses & Mooring Bollards on Forecastle Deck
    for sx in [-1, 1]:
        bow.append(create_cyl_part(f"Windlass_{sx}", 0.95, 0.95, 2.2, (sx * 3.4, 8.5, 1.7), mat_dark, verts=14, rot_euler=(0, math.pi / 2, 0)))
        bow.append(create_box_part(f"AnchorShank_{sx}", (0.35, 0.35, 2.6), (sx * 10.2, 15.0, -1.2), mat_dark, rot_euler=(0, sx * 0.35, 0), bevel=0.02))
        bow.append(create_box_part(f"AnchorFluke_{sx}", (1.5, 0.45, 1.1), (sx * 10.5, 15.0, -2.3), mat_dark, rot_euler=(0, sx * 0.35, 0), bevel=0.03))
        for bz in [5.0, 12.0]:
            bow.append(create_cyl_part(f"Bollard_{sx}_{bz}", 0.28, 0.32, 0.85, (sx * 11.2 * (1 - bz / 34), bz, 1.45), mat_yellow, verts=12))
    # Forward Forecastle Signal Mast + Crossbars
    bow.append(create_cyl_part("ForeMast", 0.52, 0.24, 17.5, (0, 12.5, 9.6), mat_yellow, verts=12))
    bow.append(create_box_part("ForeCross1", (8.2, 0.32, 0.32), (0, 12.5, 15.0), mat_yellow, bevel=0.02))
    bow.append(create_box_part("ForeCross2", (5.2, 0.26, 0.26), (0, 12.5, 17.2), mat_yellow, bevel=0.02))
    join_children_into_single_mesh("ForecastleBow", bow)

    export_glb("ship_structures.glb")


# =============================================================================
# 5. BUILD HIGH-DETAIL FIRST-PERSON & THIRD-PERSON WEAPONS (weapons_arsenal.glb)
# Remember: +Y_b exports to -Z_three (muzzle forward!), +Z_b exports to +Y_three (up!)
# =============================================================================
def build_weapons_arsenal():
    reset_scene()
    m_gun = make_mat("MAT_WEP_GUNMETAL", (0.20, 0.23, 0.27, 1.0), metallic=0.86, roughness=0.30)
    m_dark = make_mat("MAT_WEP_DARKSTEEL", (0.10, 0.12, 0.14, 1.0), metallic=0.82, roughness=0.36)
    m_chrome = make_mat("MAT_WEP_CHROME", (0.86, 0.90, 0.94, 1.0), metallic=0.96, roughness=0.16)
    m_gold = make_mat("MAT_WEP_GOLD", (0.94, 0.68, 0.18, 1.0), metallic=0.92, roughness=0.22)
    m_walnut = make_mat("MAT_WEP_WALNUT", (0.85, 0.85, 0.85, 1.0), metallic=0.12, roughness=0.46)
    m_camo = make_mat("MAT_WEP_CAMO", (0.88, 0.88, 0.88, 1.0), metallic=0.35, roughness=0.45)
    m_olive = make_mat("MAT_WEP_OLIVE", (0.24, 0.38, 0.21, 1.0), metallic=0.22, roughness=0.52)
    m_lens = make_mat("MAT_WEP_LENS", (0.14, 0.52, 0.92, 1.0), metallic=0.95, roughness=0.06)
    m_red = make_mat("MAT_WEP_RED", (0.88, 0.18, 0.14, 1.0), metallic=0.25, roughness=0.38)

    # ---- 1) Weapon_AK47 (Fire-Kirin / Classic Walnut + Gold Dragon Relief) ----
    ak = []
    ak.append(create_box_part("AK_Rec", (0.048, 0.27, 0.068), (0, 0.05, 0.0), m_gun, bevel=0.004))
    ak.append(create_cyl_part("AK_Cover", 0.024, 0.024, 0.25, (0, 0.045, 0.036), m_dark, verts=14, rot_euler=(math.pi / 2, 0, 0)))
    # Sculpted Golden Fire-Kirin Dragon Spine Scales
    for i in range(6):
        ak.append(create_box_part(
            f"AK_Scale_{i}", (0.052, 0.038, 0.016),
            (0, -0.04 + i * 0.038, 0.048), m_gold,
            rot_euler=(math.radians(-14), 0, 0), bevel=0.003
        ))
    # Charging handle, trigger guard & trigger
    ak.append(create_cyl_part("AK_BoltHandle", 0.006, 0.008, 0.032, (0.032, 0.09, 0.018), m_chrome, verts=10, rot_euler=(0, math.pi / 2, 0)))
    ak.append(create_box_part("AK_TrigGuard", (0.016, 0.055, 0.032), (0, -0.01, -0.048), m_dark, bevel=0.002))
    ak.append(create_box_part("AK_Grip", (0.032, 0.046, 0.105), (0, -0.035, -0.078), m_walnut, rot_euler=(math.radians(-26), 0, 0), bevel=0.005))
    # Contoured Walnut Buttstock + Gold Buttplate
    ak.append(create_box_part("AK_Stock", (0.042, 0.21, 0.076), (0, -0.18, -0.028), m_walnut, rot_euler=(math.radians(13), 0, 0), bevel=0.007))
    ak.append(create_box_part("AK_Buttplate", (0.044, 0.018, 0.082), (0, -0.285, -0.052), m_gold, rot_euler=(math.radians(13), 0, 0), bevel=0.003))
    # Vented Upper & Lower Walnut Handguard + Golden Kirin Collar
    ak.append(create_box_part("AK_HandguardBot", (0.050, 0.20, 0.042), (0, 0.29, -0.006), m_walnut, bevel=0.006))
    ak.append(create_cyl_part("AK_HandguardTop", 0.022, 0.022, 0.18, (0, 0.285, 0.024), m_walnut, verts=12, rot_euler=(math.pi / 2, 0, 0)))
    ak.append(create_box_part("AK_GoldCollar", (0.056, 0.032, 0.064), (0, 0.392, 0.006), m_gold, bevel=0.004))
    # Rifled Barrel, Gas Tube, Gas Block, Hooded Front Sight & Slanted Compensator
    ak.append(create_cyl_part("AK_Barrel", 0.0105, 0.0115, 0.33, (0, 0.54, 0.008), m_dark, verts=16, rot_euler=(math.pi / 2, 0, 0)))
    ak.append(create_cyl_part("AK_GasTube", 0.0085, 0.0085, 0.16, (0, 0.46, 0.030), m_gun, verts=12, rot_euler=(math.pi / 2, 0, 0)))
    ak.append(create_box_part("AK_GasBlock", (0.022, 0.032, 0.038), (0, 0.535, 0.018), m_gun, bevel=0.003))
    ak.append(create_box_part("AK_FrontSight", (0.016, 0.026, 0.046), (0, 0.655, 0.032), m_dark, bevel=0.002))
    ak.append(create_cyl_part("AK_MuzzleBrake", 0.013, 0.013, 0.042, (0, 0.71, 0.008), m_gold, verts=14, rot_euler=(math.pi / 2, 0, 0)))
    # Smoothly Curved 6-Segment Banana Magazine!
    for seg in range(6):
        t = seg / 5.0
        ang = math.radians(10 + t * 28)
        my = 0.145 + math.sin(ang) * seg * 0.028
        mz = -0.055 - math.cos(ang) * seg * 0.033
        ak.append(create_box_part(
            f"AK_Mag_{seg}", (0.034, 0.058, 0.042),
            (0, my, mz), m_gold if seg >= 4 else m_walnut,
            rot_euler=(-ang, 0, 0), bevel=0.003
        ))
    join_children_into_single_mesh("Weapon_AK47", ak)

    # ---- 2) Weapon_M4A1S (Camo Receiver + Carry Handle + Ribbed Handguard + Suppressor) ----
    m4 = []
    m4.append(create_box_part("M4_Upper", (0.050, 0.25, 0.074), (0, 0.04, 0.002), m_camo, bevel=0.005))
    m4.append(create_box_part("M4_CarryTop", (0.024, 0.16, 0.016), (0, 0.035, 0.064), m_dark, bevel=0.003))
    for py in [-0.03, 0.095]:
        m4.append(create_box_part(f"M4_CarryLeg_{py}", (0.022, 0.022, 0.028), (0, py, 0.046), m_dark, bevel=0.002))
    m4.append(create_box_part("M4_Grip", (0.032, 0.046, 0.10), (0, -0.03, -0.074), m_dark, rot_euler=(math.radians(-24), 0, 0), bevel=0.004))
    m4.append(create_cyl_part("M4_BufTube", 0.017, 0.017, 0.19, (0, -0.17, 0.012), m_dark, verts=14, rot_euler=(math.pi / 2, 0, 0)))
    m4.append(create_box_part("M4_Stock", (0.042, 0.15, 0.095), (0, -0.22, -0.018), m_camo, bevel=0.005))
    # Ribbed Handguard + Picatinny Top Rail + Triangle Front Sight
    m4.append(create_cyl_part("M4_Guard", 0.030, 0.032, 0.22, (0, 0.285, 0.008), m_camo, verts=16, rot_euler=(math.pi / 2, 0, 0)))
    for r in range(8):
        m4.append(create_box_part(f"M4_Pic_{r}", (0.024, 0.014, 0.008), (0, 0.19 + r * 0.025, 0.040), m_dark, bevel=0.001))
    m4.append(create_box_part("M4_TriSight", (0.014, 0.034, 0.052), (0, 0.415, 0.040), m_dark, rot_euler=(math.radians(18), 0, 0), bevel=0.002))
    # Fluted M4A1-S Silencer / Suppressor
    m4.append(create_cyl_part("M4_Silencer", 0.020, 0.020, 0.27, (0, 0.56, 0.008), m_dark, verts=20, rot_euler=(math.pi / 2, 0, 0)))
    for gr in range(5):
        m4.append(create_cyl_part(f"M4_SilRing_{gr}", 0.0215, 0.0215, 0.012, (0, 0.47 + gr * 0.042, 0.008), m_gun, verts=20, rot_euler=(math.pi / 2, 0, 0)))
    m4.append(create_box_part("M4_Mag", (0.033, 0.058, 0.155), (0, 0.125, -0.098), m_gun, rot_euler=(math.radians(-14), 0, 0), bevel=0.003))
    join_children_into_single_mesh("Weapon_M4A1S", m4)

    # ---- 3) Weapon_AWM (Olive Chassis + Optical Dual-Bell Scope + Bipod + Bolt) ----
    awm = []
    awm.append(create_box_part("AWM_Chassis", (0.052, 0.55, 0.076), (0, 0.13, -0.008), m_olive, bevel=0.007))
    awm.append(create_box_part("AWM_Stock", (0.046, 0.24, 0.095), (0, -0.23, -0.022), m_olive, bevel=0.007))
    awm.append(create_box_part("AWM_CheekPad", (0.048, 0.12, 0.032), (0, -0.20, 0.034), m_dark, bevel=0.005))
    awm.append(create_cyl_part("AWM_Barrel", 0.012, 0.0155, 0.46, (0, 0.59, 0.016), m_dark, verts=16, rot_euler=(math.pi / 2, 0, 0)))
    awm.append(create_box_part("AWM_Brake", (0.034, 0.062, 0.028), (0, 0.825, 0.016), m_gun, bevel=0.003))
    # Folded Bipod under forend
    for sx in [-1, 1]:
        awm.append(create_cyl_part(f"AWM_Bipod_{sx}", 0.007, 0.007, 0.20, (sx * 0.026, 0.34, -0.055), m_dark, verts=8, rot_euler=(math.pi / 2, 0, 0)))
    # Dual-Bell Sniper Scope + Turrets + Blue Optical Lenses
    for ry in [0.05, 0.19]:
        awm.append(create_box_part(f"AWM_Ring_{ry}", (0.038, 0.022, 0.042), (0, ry, 0.050), m_dark, bevel=0.002))
    awm.append(create_cyl_part("AWM_ScopeTube", 0.017, 0.017, 0.25, (0, 0.12, 0.068), m_dark, verts=18, rot_euler=(math.pi / 2, 0, 0)))
    awm.append(create_cyl_part("AWM_BellRear", 0.018, 0.024, 0.06, (0, -0.02, 0.068), m_dark, verts=18, rot_euler=(math.pi / 2, 0, 0)))
    awm.append(create_cyl_part("AWM_LensRear", 0.021, 0.021, 0.006, (0, -0.051, 0.068), m_lens, verts=18, rot_euler=(math.pi / 2, 0, 0)))
    awm.append(create_cyl_part("AWM_BellFront", 0.028, 0.018, 0.075, (0, 0.27, 0.068), m_dark, verts=18, rot_euler=(math.pi / 2, 0, 0)))
    awm.append(create_cyl_part("AWM_TurretTop", 0.011, 0.011, 0.022, (0, 0.12, 0.092), m_gun, verts=12))
    # Bolt Handle
    awm.append(create_cyl_part("AWM_Bolt", 0.006, 0.006, 0.048, (0.038, 0.02, 0.022), m_chrome, verts=10, rot_euler=(0, math.pi / 2, 0)))
    awm.append(create_cyl_part("AWM_BoltKnob", 0.011, 0.011, 0.018, (0.062, 0.02, 0.018), m_dark, verts=10))
    join_children_into_single_mesh("Weapon_AWM", awm)

    # ---- 4) Weapon_Barrett (M82A1 Vented Shroud + Arrowhead .50 Muzzle Brake) ----
    bar = []
    bar.append(create_box_part("BAR_Body", (0.068, 0.64, 0.092), (0, 0.18, -0.005), m_gun, bevel=0.006))
    # Cooling vent slats along barrel shroud
    for v in range(7):
        bar.append(create_box_part(f"BAR_Vent_{v}", (0.072, 0.032, 0.022), (0, 0.24 + v * 0.038, 0.016), m_dark, bevel=0.001))
    bar.append(create_cyl_part("BAR_Barrel", 0.016, 0.019, 0.44, (0, 0.67, 0.014), m_dark, verts=16, rot_euler=(math.pi / 2, 0, 0)))
    # Iconic Arrowhead .50 BMG Dual-Chamber Muzzle Brake!
    for s in [-1, 1]:
        bar.append(create_box_part(
            f"BAR_BrakeWing_{s}", (0.042, 0.088, 0.046),
            (s * 0.022, 0.90, 0.014), m_dark,
            rot_euler=(0, 0, s * math.radians(24)), bevel=0.004
        ))
    bar.append(create_cyl_part("BAR_Scope", 0.022, 0.022, 0.30, (0, 0.15, 0.084), m_dark, verts=18, rot_euler=(math.pi / 2, 0, 0)))
    bar.append(create_cyl_part("BAR_Lens", 0.020, 0.020, 0.006, (0, -0.002, 0.084), m_lens, verts=18, rot_euler=(math.pi / 2, 0, 0)))
    bar.append(create_box_part("BAR_Mag", (0.044, 0.11, 0.155), (0, 0.18, -0.112), m_dark, rot_euler=(math.radians(-12), 0, 0), bevel=0.004))
    bar.append(create_box_part("BAR_Grip", (0.036, 0.048, 0.105), (0, -0.02, -0.082), m_dark, rot_euler=(math.radians(-22), 0, 0), bevel=0.004))
    join_children_into_single_mesh("Weapon_Barrett", bar)

    # ---- 5) Weapon_Deagle (Brushed Chrome .50 AE Desert Eagle) ----
    dg = []
    dg.append(create_box_part("DG_Slide", (0.042, 0.225, 0.052), (0, 0.18, 0.020), m_chrome, bevel=0.006))
    dg.append(create_box_part("DG_TopRib", (0.022, 0.21, 0.010), (0, 0.185, 0.048), m_dark, bevel=0.002))
    dg.append(create_cyl_part("DG_MuzzleHole", 0.011, 0.011, 0.02, (0, 0.292, 0.024), m_dark, verts=12, rot_euler=(math.pi / 2, 0, 0)))
    dg.append(create_box_part("DG_Grip", (0.036, 0.056, 0.118), (0, 0.09, -0.052), m_dark, rot_euler=(math.radians(-22), 0, 0), bevel=0.005))
    dg.append(create_box_part("DG_TrigGuard", (0.014, 0.052, 0.028), (0, 0.145, -0.022), m_chrome, bevel=0.002))
    join_children_into_single_mesh("Weapon_Deagle", dg)

    # ---- 6) Weapon_Kukri (Beveled Silver Nepalese Kukri Blade + Golden Bolster) ----
    kk = []
    kk.append(create_cyl_part("KK_Grip", 0.017, 0.020, 0.13, (0.02, 0.14, -0.05), m_walnut, verts=14, rot_euler=(math.radians(-20), 0, 0), bevel=0.003))
    kk.append(create_cyl_part("KK_Pommel", 0.024, 0.018, 0.022, (0.02, 0.118, -0.112), m_gold, verts=14, rot_euler=(math.radians(-20), 0, 0), bevel=0.003))
    kk.append(create_box_part("KK_Bolster", (0.048, 0.032, 0.018), (0.02, 0.17, 0.012), m_gold, bevel=0.004))
    # Multi-segment forward-curving Kukri blade with beveled chrome edge & dark spine fuller
    kk.append(create_box_part("KK_BladeBase", (0.009, 0.046, 0.13), (0.02, 0.192, 0.072), m_chrome, rot_euler=(math.radians(-22), 0, 0), bevel=0.003))
    kk.append(create_box_part("KK_BladeBelly", (0.008, 0.064, 0.145), (0.02, 0.245, 0.168), m_chrome, rot_euler=(math.radians(-42), 0, 0), bevel=0.003))
    kk.append(create_box_part("KK_BladeTip", (0.006, 0.046, 0.085), (0.02, 0.305, 0.238), m_chrome, rot_euler=(math.radians(-56), 0, 0), bevel=0.002))
    join_children_into_single_mesh("Weapon_Kukri", kk)

    # ---- 7) Weapon_Grenade (Detailed M67 / CF HE Frag Grenade + Spoon + Pin Ring) ----
    gr = []
    gr.append(create_cyl_part("GR_Body", 0.042, 0.044, 0.105, (0, 0.18, -0.01), m_olive, verts=20, bevel=0.012))
    gr.append(create_cyl_part("GR_Band", 0.045, 0.045, 0.022, (0, 0.18, 0.008), m_red, verts=20, bevel=0.002))
    gr.append(create_cyl_part("GR_Fuze", 0.020, 0.016, 0.036, (0, 0.18, 0.058), m_chrome, verts=14, bevel=0.002))
    gr.append(create_box_part("GR_Spoon", (0.014, 0.018, 0.095), (0.038, 0.18, 0.015), m_dark, rot_euler=(0, math.radians(-12), 0), bevel=0.002))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.018, minor_radius=0.003, major_segments=16, minor_segments=8, location=(-0.026, 0.18, 0.056))
    ring = bpy.context.active_object
    ring.rotation_euler = (math.pi / 2, 0, 0)
    ring.data.materials.append(m_chrome)
    box_uv_unwrap(ring)
    gr.append(ring)
    join_children_into_single_mesh("Weapon_Grenade", gr)

    export_glb("weapons_arsenal.glb")


if __name__ == "__main__":
    build_wood_crate()
    build_iso_container()
    build_hollow_container()
    build_ship_structures()
    build_weapons_arsenal()
    print("ALL BLENDER 5.3 HIGH-DETAIL GLB MODELS EXPORTED SUCCESSFULLY!")
