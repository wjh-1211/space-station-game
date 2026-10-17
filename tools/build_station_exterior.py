import bpy
import math
import os
from mathutils import Vector

OUTPUT_DIR = r"D:\DeskTop\space station\space-station-game\public\models"
GLB_PATH = os.path.join(OUTPUT_DIR, "station-exterior-v5.glb")
BLEND_PATH = os.path.join(OUTPUT_DIR, "station-exterior-v5.blend")


def material(name, color, metallic=0.0, roughness=0.6, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        emission_input = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        strength_input = bsdf.inputs.get("Emission Strength")
        if emission_input:
            emission_input.default_value = (*emission, 1.0)
        if strength_input:
            strength_input.default_value = emission_strength
    return mat


BODY = material("Thermal White", (0.69, 0.72, 0.70), 0.05, 0.82)
BODY_LIGHT = material("Sunlit White", (0.88, 0.89, 0.85), 0.025, 0.76)
THERMAL = material("Thermal Blanket", (0.53, 0.57, 0.55), 0.02, 0.9)
METAL = material("Structural Metal", (0.34, 0.37, 0.36), 0.66, 0.42)
DARK = material("Equipment Dark", (0.045, 0.065, 0.07), 0.5, 0.46)
SOLAR = material("Solar Cell Umber", (0.082, 0.022, 0.025), 0.28, 0.5)
SOLAR_CORE = material("Core Solar Cell", (0.026, 0.055, 0.082), 0.3, 0.46)
SOLAR_FRAME = material("Solar Cell Frame", (0.43, 0.40, 0.32), 0.7, 0.38)
SOLAR_GRID = material("Solar Cell Grid", (0.31, 0.25, 0.20), 0.68, 0.42)
SOLAR_BACK = material("Solar Array Backsheet", (0.25, 0.27, 0.25), 0.48, 0.58)
GOLD = material("MLI Gold", (0.72, 0.48, 0.16), 0.3, 0.46)
FLAG_RED = material("Flag Red", (0.92, 0.018, 0.012), 0.04, 0.48, (0.32, 0.002, 0.001), 0.16)
FLAG_GOLD = material("Flag Gold", (1.0, 0.76, 0.055), 0.08, 0.42, (0.40, 0.20, 0.005), 0.2)
WINDOW = material("Optical Window", (0.015, 0.04, 0.06), 0.72, 0.18)
MLI_SILVER = material("MLI Silver", (0.64, 0.67, 0.64), 0.52, 0.34)
CABLE = material("External Cable", (0.095, 0.105, 0.095), 0.42, 0.54)


def collection(name, parent=None):
    col = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(col)
    return col


ROOT = collection("OVW_Station_Assembly")
EXT = collection("External_Modules", ROOT)
SOLAR_COL = collection("Solar_Arrays", ROOT)
EQUIP = collection("External_Equipment", ROOT)
HOTSPOTS = collection("Interaction_Hotspots", ROOT)


def move_to(obj, col):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def smooth(obj, bevel=0.0):
    if hasattr(obj.data, "polygons"):
        for poly in obj.data.polygons:
            poly.use_smooth = True
    if bevel:
        mod = obj.modifiers.new("Edge Softening", "BEVEL")
        mod.width = bevel
        mod.segments = 3


def cyl(name, radius, depth, location, rotation=(0, 0, 0), mat=BODY, col=EXT, vertices=64, bevel=0.0, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = move_to(bpy.context.object, col)
    obj.name = name
    obj.data.materials.append(mat)
    smooth(obj, bevel)
    if parent:
        obj.parent = parent
    return obj


def cone(name, radius1, radius2, depth, location, rotation=(0, 0, 0), mat=BODY, parent=None):
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=radius1, radius2=radius2, depth=depth, location=location, rotation=rotation)
    obj = move_to(bpy.context.object, EXT)
    obj.name = name
    obj.data.materials.append(mat)
    smooth(obj, 0.04)
    if parent:
        obj.parent = parent
    return obj


def box(name, scale, location, mat, col=EQUIP, rotation=(0, 0, 0), parent=None, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = move_to(bpy.context.object, col)
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    smooth(obj, bevel)
    if parent:
        obj.parent = parent
    return obj


def star(name, center, outer_radius, rotation, mat=FLAG_GOLD, parent=None):
    """Create a shallow five-point star on an X/Z-facing marking surface."""
    cx, cy, cz = center
    vertices = []
    for index in range(10):
        radius = outer_radius if index % 2 == 0 else outer_radius * 0.40
        angle = rotation - index * math.pi / 5
        vertices.append((cx + math.cos(angle) * radius, cy, cz + math.sin(angle) * radius))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], [list(range(10))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    EQUIP.objects.link(obj)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def torus(name, major, minor, location, rotation=(0, 0, 0), mat=METAL, parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=64, minor_segments=12, location=location, rotation=rotation)
    obj = move_to(bpy.context.object, EXT)
    obj.name = name
    obj.data.materials.append(mat)
    smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def radial_box(name, parent, radius, angle, axial, tangential, radial, axial_length, mat, col=EQUIP, bevel=0.025):
    """Place a shallow component on a cylindrical shell in module-local coordinates."""
    radial_center = radius + radial * 0.5
    return box(
        name,
        (radial, tangential, axial_length),
        (math.cos(angle) * radial_center, math.sin(angle) * radial_center, axial),
        mat,
        col,
        rotation=(0, 0, angle),
        parent=parent,
        bevel=bevel,
    )


def radial_disc(name, parent, radius, angle, axial, disc_radius, depth, mat, col=EQUIP):
    radial_center = radius + depth * 0.5
    return cyl(
        name,
        disc_radius,
        depth,
        (math.cos(angle) * radial_center, math.sin(angle) * radial_center, axial),
        (0, math.pi / 2, angle),
        mat,
        col,
        vertices=32,
        bevel=0.015,
        parent=parent,
    )


def radial_rail(name, parent, radius, angle, axial_start, axial_end):
    start = Vector((math.cos(angle) * (radius + 0.15), math.sin(angle) * (radius + 0.15), axial_start))
    end = Vector((math.cos(angle) * (radius + 0.15), math.sin(angle) * (radius + 0.15), axial_end))
    direction = end - start
    obj = cyl(name, 0.035, direction.length, (start + end) * 0.5, mat=METAL, col=EQUIP, vertices=12, bevel=0.01)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    obj.parent = parent
    return obj


def module(name, module_id, position, axis, length, radius):
    root = bpy.data.objects.new(name, None)
    EXT.objects.link(root)
    root.location = position
    root.rotation_euler = (0, math.pi / 2, 0) if axis == "x" else (0, 0, 0)
    root["moduleId"] = module_id
    root["sourceStatus"] = "public-structure-based approximation"
    return root


def add_shell_hardware(name, root, length, radius, pattern_offset=0.0):
    """Reusable public-facing shell details: rails, visual ports, MLI blankets and fasteners."""
    for rail_index, angle in enumerate((0.42 + pattern_offset, 1.15 + pattern_offset, 2.58 + pattern_offset, 5.32 + pattern_offset)):
        radial_rail(f"{name}_LongRail_{rail_index}", root, radius, angle, -length * 0.36, length * 0.33)
        for z_pos in (-length * 0.24, -length * 0.02, length * 0.21):
            radial_box(
                f"{name}_RailStandoff_{rail_index}_{z_pos:.2f}",
                root,
                radius,
                angle,
                z_pos,
                0.11,
                0.13,
                0.14,
                METAL,
                bevel=0.015,
            )

    for index, (angle, z_pos, disc_radius) in enumerate(
        ((1.58 + pattern_offset, -length * 0.28, 0.24), (1.58 + pattern_offset, length * 0.03, 0.18), (0.0 + pattern_offset, length * 0.19, 0.16), (3.14 + pattern_offset, -length * 0.08, 0.18))
    ):
        radial_disc(f"{name}_OpticalPort_{index}", root, radius, angle, z_pos, disc_radius, 0.075, WINDOW)
        radial_disc(f"{name}_PortFrame_{index}", root, radius + 0.07, angle, z_pos, disc_radius * 1.35, 0.032, MLI_SILVER)

    for index, (angle, z_pos, span) in enumerate(
        ((2.22 + pattern_offset, -length * 0.18, length * 0.2), (4.0 + pattern_offset, length * 0.16, length * 0.16), (5.18 + pattern_offset, -length * 0.34, length * 0.12))
    ):
        radial_box(
            f"{name}_MLIBlanket_{index}",
            root,
            radius,
            angle,
            z_pos,
            1.08,
            0.035,
            span,
            MLI_SILVER if index != 2 else THERMAL,
            bevel=0.018,
        )

    for index in range(20):
        angle = pattern_offset + (index % 5) * math.tau / 5 + 0.18
        z_pos = -length * 0.31 + (index // 5) * length * 0.18
        radial_disc(f"{name}_Fastener_{index}", root, radius, angle, z_pos, 0.045, 0.032, DARK)


def pressure_section(name, root, center, length, radius, shell=BODY_LIGHT, bands=(0.0,)):
    """A visible pressure-vessel section, kept separately named for review in Blender."""
    cyl(f"{name}_Shell", radius, length, (0, 0, center), mat=shell, col=EXT, parent=root, bevel=0.045)
    for index, offset in enumerate(bands):
        torus(f"{name}_Band_{index}", radius * 1.008, 0.036, (0, 0, center + offset), mat=MLI_SILVER, parent=root)


def axial_port(name, root, z_pos, radius=0.82, direction=1):
    """Publicly visible axial docking interface, with a collar, blackout face and latching ring."""
    collar_center = z_pos + direction * 0.12
    cyl(f"{name}_Collar", radius, 0.28, (0, 0, collar_center), mat=MLI_SILVER, col=EXT, parent=root, bevel=0.02)
    cyl(f"{name}_Face", radius * 0.74, 0.10, (0, 0, z_pos + direction * 0.31), mat=DARK, col=EXT, parent=root, bevel=0.018)
    torus(f"{name}_LatchingRing", radius * 0.94, 0.072, (0, 0, z_pos + direction * 0.27), mat=METAL, parent=root)


def add_service_cluster(name, root, radius, stations, angle=1.52, payload=False):
    """Model public-facing equipment trays without inventing internal hardware."""
    for index, z_pos in enumerate(stations):
        radial_box(
            f"{name}_EquipmentTray_{index}",
            root,
            radius,
            angle + (0.24 if index % 2 else -0.08),
            z_pos,
            0.72 if payload else 0.54,
            0.18,
            0.55 if payload else 0.42,
            DARK if index % 3 else GOLD,
            bevel=0.035,
        )
        radial_disc(
            f"{name}_Camera_{index}",
            root,
            radius,
            angle + (0.5 if index % 2 else -0.5),
            z_pos + 0.18,
            0.10,
            0.075,
            WINDOW,
        )


def add_lab_end_hardware(name, root, radius, stations):
    """Dense external racks around the resource ends seen in orbital photos."""
    angles = (0.52, 1.12, 1.58, 2.08, 2.62, 4.72)
    for station_index, z_pos in enumerate(stations):
        for angle_index, angle in enumerate(angles):
            width = 0.28 + 0.09 * ((station_index + angle_index) % 3)
            height = 0.36 + 0.12 * ((station_index * 2 + angle_index) % 3)
            equipment_mat = MLI_SILVER if angle_index % 3 == 0 else (DARK if angle_index % 3 == 1 else THERMAL)
            radial_box(
                f"{name}_Rack_{station_index}_{angle_index}",
                root,
                radius,
                angle,
                z_pos + (angle_index % 2 - 0.5) * 0.16,
                width,
                0.20,
                height,
                equipment_mat,
                bevel=0.025,
            )
        radial_disc(f"{name}_EndCamera_{station_index}", root, radius, 1.56, z_pos + 0.32, 0.10, 0.09, WINDOW)

    for rail_index, angle in enumerate((0.86, 1.57, 2.30)):
        radial_rail(f"{name}_EndRail_{rail_index}", root, radius + 0.05, angle, min(stations) - 0.4, max(stations) + 0.4)


def add_visible_lab_panels(name, root, radius, stations):
    """Asymmetric blanket panels, access covers and latches on the camera-facing half."""
    for index, z_pos in enumerate(stations):
        angle = 1.57 + (-0.28 if index % 3 == 0 else (0.24 if index % 3 == 1 else 0.0))
        width = 0.72 + 0.12 * (index % 3)
        height = 0.58 + 0.16 * ((index + 1) % 3)
        panel_mat = (BODY, THERMAL, MLI_SILVER)[index % 3]
        radial_box(
            f"{name}_AccessPanel_{index}",
            root,
            radius,
            angle,
            z_pos,
            width,
            0.042,
            height,
            panel_mat,
            bevel=0.018,
        )
        radial_disc(
            f"{name}_PanelLatch_{index}",
            root,
            radius + 0.045,
            angle + 0.11,
            z_pos + height * 0.27,
            0.055,
            0.025,
            DARK,
        )


def add_rear_shell_hardware(name, root, length, radius, layout="service"):
    """Layered rear-side hardware based on public views, without claiming hidden engineering fidelity."""
    rear_angle = math.pi * 1.5
    rail_angles = (rear_angle - 0.54, rear_angle - 0.18, rear_angle + 0.22, rear_angle + 0.58)
    for rail_index, angle in enumerate(rail_angles):
        rail = radial_rail(
            f"{name}_RearCableRun_{rail_index}",
            root,
            radius + 0.025,
            angle,
            -length * 0.36 + rail_index * 0.12,
            length * 0.34 - rail_index * 0.09,
        )
        rail.data.materials[0] = CABLE if rail_index in (1, 2) else METAL

    station_count = 7 if layout == "core" else 8
    for index in range(station_count):
        axial = -length * 0.31 + index * (length * 0.62 / max(1, station_count - 1))
        angle = rear_angle + (-0.34 if index % 3 == 0 else (0.29 if index % 3 == 1 else -0.04))
        tangential = 0.50 + 0.12 * (index % 3)
        axial_length = 0.42 + 0.13 * ((index + 1) % 3)
        equipment_mat = (MLI_SILVER, DARK, GOLD)[index % 3]
        radial_box(
            f"{name}_RearEquipment_{index}",
            root,
            radius,
            angle,
            axial,
            tangential,
            0.17 + 0.04 * (index % 2),
            axial_length,
            equipment_mat,
            bevel=0.028,
        )
        radial_box(
            f"{name}_RearCableClamp_{index}",
            root,
            radius + 0.16,
            rear_angle,
            axial + axial_length * 0.30,
            1.12,
            0.035,
            0.08,
            CABLE,
            bevel=0.012,
        )

    blanket_layout = (
        (rear_angle - 0.72, -length * 0.22, 0.92, length * 0.16),
        (rear_angle + 0.70, -length * 0.02, 0.84, length * 0.18),
        (rear_angle - 0.66, length * 0.23, 1.02, length * 0.15),
    )
    for index, (angle, axial, width, span) in enumerate(blanket_layout):
        radial_box(
            f"{name}_RearThermalPanel_{index}",
            root,
            radius,
            angle,
            axial,
            width,
            0.04,
            span,
            THERMAL if index == 1 else MLI_SILVER,
            bevel=0.018,
        )

    for index, offset in enumerate((-length * 0.13, length * 0.17)):
        radial_disc(f"{name}_RearSensorFrame_{index}", root, radius + 0.03, rear_angle, offset, 0.19, 0.07, MLI_SILVER)
        radial_disc(f"{name}_RearSensor_{index}", root, radius + 0.105, rear_angle, offset, 0.105, 0.06, WINDOW)

    if layout == "eva":
        for index, axial in enumerate((-length * 0.19, -length * 0.07, length * 0.05, length * 0.17)):
            radial_box(f"{name}_RearEVAHandle_{index}", root, radius + 0.02, rear_angle + 0.52, axial, 0.11, 0.16, 0.58, METAL, bevel=0.02)
    elif layout == "payload":
        for index, axial in enumerate((-length * 0.24, -length * 0.08, length * 0.08, length * 0.24)):
            radial_box(f"{name}_RearPayloadAdapter_{index}", root, radius, rear_angle - 0.48, axial, 0.72, 0.24, 0.54, DARK if index % 2 else GOLD, bevel=0.035)


def add_tianhe_structure(root):
    # The official side view fixes the 16.6 m core-module silhouette.  The two
    # life-control columns dominate the length; the resource cabin is narrower.
    pressure_section("STA_Tianhe_LifeControlLarge", root, 3.45, 5.10, 2.08, BODY_LIGHT, (-2.24, -1.12, 0.0, 1.18, 2.28))
    pressure_section("STA_Tianhe_LifeControlSmall", root, -1.62, 5.00, 2.08, BODY_LIGHT, (-2.18, -1.08, 0.02, 1.14, 2.18))
    pressure_section("STA_Tianhe_ResourceCabin", root, -5.60, 2.80, 1.76, BODY, (-1.04, 0.0, 1.04))
    cone("STA_Tianhe_ResourceTaper", 1.34, 1.76, 1.32, (0, 0, -7.66), mat=BODY, parent=root)
    cyl("STA_Tianhe_AftServiceModule", 1.28, 1.42, (0, 0, -9.02), mat=THERMAL, col=EXT, parent=root, bevel=0.035)
    axial_port("STA_Tianhe_AftDocking", root, -9.92, 0.88, -1)

    add_shell_hardware("STA_Tianhe", root, 16.1, 2.08, 0.06)
    add_rear_shell_hardware("STA_Tianhe", root, 15.8, 2.08, "core")
    add_service_cluster("STA_Tianhe_Service", root, 2.08, (-4.42, -2.76, -1.08, 0.92, 2.64, 4.48), 1.44)

    # Four thruster packs and the Earth-observation window are visible signatures of Tianhe.
    for index, angle in enumerate((0.34, 2.80, 3.47, 5.92)):
        radial_box(f"STA_Tianhe_AftThruster_{index}", root, 1.28, angle, -9.02, 0.30, 0.35, 0.56, DARK, bevel=0.04)
        radial_disc(f"STA_Tianhe_ThrusterBell_{index}", root, 1.55, angle, -9.02, 0.14, 0.16, DARK)
    radial_box("STA_Tianhe_EarthObservationBay", root, 2.08, 1.56, -1.28, 1.15, 0.16, 0.92, WINDOW, bevel=0.055)
    radial_box("STA_Tianhe_ObservationFrame", root, 2.24, 1.56, -1.28, 1.33, 0.045, 1.08, MLI_SILVER, bevel=0.022)

    # Large, uneven MLI panels and handrail rows break the lathed-cylinder look.
    panel_layout = (
        (-0.62, 4.35, 0.82, 0.68, BODY),
        (0.42, 2.52, 0.64, 0.72, THERMAL),
        (-0.34, 0.54, 0.78, 0.56, MLI_SILVER),
        (0.55, -2.45, 0.68, 0.82, BODY),
        (-0.48, -4.54, 0.92, 0.64, THERMAL),
    )
    for index, (angle_offset, z_pos, width, height, panel_mat) in enumerate(panel_layout):
        radial_box(
            f"STA_Tianhe_VisibleBlanket_{index}",
            root,
            2.08 if z_pos > -4.1 else 1.76,
            1.52 + angle_offset,
            z_pos,
            width,
            0.045,
            height,
            panel_mat,
            bevel=0.018,
        )


def add_wentian_structure(root):
    # Wentian: working cabin, EVA airlock cabin and tapered resource cabin.
    pressure_section("STA_Wentian_WorkingCabin", root, 1.65, 8.95, 2.10, BODY_LIGHT, (-3.82, -2.35, -0.75, 1.1, 3.55))
    pressure_section("STA_Wentian_AirlockCabin", root, -4.32, 2.90, 1.83, BODY, (-1.02, 0.0, 1.02))
    cone("STA_Wentian_ResourceTransition", 1.83, 1.48, 1.28, (0, 0, -6.40), mat=MLI_SILVER, parent=root)
    pressure_section("STA_Wentian_ResourceCabin", root, -7.50, 1.20, 1.45, THERMAL, (0.0,))
    axial_port("STA_Wentian_OuterDocking", root, -8.55, 0.86, -1)

    add_shell_hardware("STA_Wentian", root, 16.7, 2.10, 0.34)
    add_service_cluster("STA_Wentian_EVAEquipment", root, 2.10, (-5.4, -3.2, -1.25, 0.85, 3.28), 0.48)
    add_lab_end_hardware("STA_Wentian_OuterEquipment", root, 1.60, (-8.06, -7.46, -6.82, -6.18))
    add_visible_lab_panels("STA_Wentian", root, 2.10, (-4.75, -3.45, -2.15, -0.78, 0.62, 2.08, 3.42, 4.72))
    add_rear_shell_hardware("STA_Wentian", root, 16.5, 2.10, "eva")

    # The externally visible EVA hatch and a mechanical-arm foundation distinguish Wentian.
    radial_disc("STA_Wentian_AirlockDoor", root, 1.83, 1.57, -4.38, 0.69, 0.11, BODY_LIGHT)
    radial_disc("STA_Wentian_AirlockWindow", root, 1.96, 1.57, -4.38, 0.17, 0.055, WINDOW)
    radial_box("STA_Wentian_ArmBase", root, 2.10, 0.20, -0.70, 1.28, 0.28, 1.48, METAL, bevel=0.05)
    radial_box("STA_Wentian_ArmBaseCover", root, 2.38, 0.20, -0.70, 0.92, 0.045, 1.18, MLI_SILVER, bevel=0.028)
    for index, z_pos in enumerate((-2.1, -1.25, -0.42, 0.48, 1.38)):
        radial_box(f"STA_Wentian_EVAHandle_{index}", root, 2.10, 0.58, z_pos, 0.12, 0.18, 0.46, METAL, bevel=0.022)


def add_mengtian_structure(root):
    # Mengtian shares the flight-level layout, but its cargo airlock and exposed-payload side are distinct.
    pressure_section("STA_Mengtian_WorkingCabin", root, -1.48, 8.60, 2.10, BODY_LIGHT, (-3.66, -2.15, -0.62, 1.18, 3.45))
    pressure_section("STA_Mengtian_CargoAirlock", root, 4.15, 2.75, 1.84, BODY, (-0.96, 0.0, 0.96))
    cone("STA_Mengtian_ResourceTransition", 1.84, 1.46, 1.25, (0, 0, 6.12), mat=MLI_SILVER, parent=root)
    pressure_section("STA_Mengtian_ResourceCabin", root, 7.28, 1.18, 1.44, THERMAL, (0.0,))
    axial_port("STA_Mengtian_OuterDocking", root, 8.35, 0.86, 1)

    add_shell_hardware("STA_Mengtian", root, 16.7, 2.10, -0.28)
    add_service_cluster("STA_Mengtian_PayloadEquipment", root, 2.10, (-3.65, -1.62, 0.4, 2.38, 4.18), -0.18, payload=True)
    add_lab_end_hardware("STA_Mengtian_OuterEquipment", root, 1.58, (6.12, 6.78, 7.42, 8.02))
    add_visible_lab_panels("STA_Mengtian", root, 2.10, (-5.05, -3.72, -2.36, -0.98, 0.44, 1.82, 3.18, 4.46))
    add_rear_shell_hardware("STA_Mengtian", root, 16.5, 2.10, "payload")

    radial_box("STA_Mengtian_CargoAirlockDoor", root, 1.84, 1.57, 4.14, 1.42, 0.13, 1.18, BODY_LIGHT, bevel=0.05)
    radial_box("STA_Mengtian_CargoDoorInset", root, 1.98, 1.57, 4.14, 1.06, 0.042, 0.86, DARK, bevel=0.035)
    for index, z_pos in enumerate((-3.05, -1.90, -0.78, 0.38, 1.52)):
        radial_box(f"STA_Mengtian_PayloadRail_{index}", root, 2.10, 0.34, z_pos, 0.13, 0.22, 0.74, METAL, bevel=0.02)
    for index, z_pos in enumerate((-2.48, -1.30, -0.14, 1.02)):
        radial_box(f"STA_Mengtian_PayloadBox_{index}", root, 2.10, 0.06, z_pos, 0.68, 0.30, 0.60, DARK if index % 2 else GOLD, bevel=0.04)


def solar_array(name, position, compact=False, rotation=(0, 0, 0), warm=False):
    root = bpy.data.objects.new(name, None)
    SOLAR_COL.objects.link(root)
    root.location = position
    root.rotation_euler = rotation
    cols, rows = 2, (3 if compact else 6)
    cell_w, cell_l = (1.22, 1.62) if compact else (1.76, 2.82)
    gap = 0.10
    for row in range(rows):
        for col in range(cols):
            x = (col - (cols - 1) / 2) * (cell_w + gap)
            z = (row - (rows - 1) / 2) * (cell_l + gap)
            cell_mat = GOLD if warm and (row + col) % 5 == 0 else (SOLAR_CORE if compact else SOLAR)
            box(f"{name}_Cell_{row}_{col}", (cell_w, 0.055, cell_l), (x, 0, z), cell_mat, SOLAR_COL, parent=root, bevel=0.01)
            # Fine conductors are visible in the new nadir photographs and give
            # the blankets their characteristic technical scale at mid zoom.
            for line_index in (-1, 0, 1):
                box(
                    f"{name}_CellGridH_{row}_{col}_{line_index}",
                    (cell_w * 0.96, 0.014, 0.018),
                    (x, 0.038, z + line_index * cell_l * 0.24),
                    SOLAR_GRID,
                    SOLAR_COL,
                    parent=root,
                    bevel=0,
                )
            box(
                f"{name}_CellGridV_{row}_{col}",
                (0.018, 0.014, cell_l * 0.96),
                (x, 0.038, z),
                SOLAR_GRID,
                SOLAR_COL,
                parent=root,
                bevel=0,
            )
            box(
                f"{name}_Backsheet_{row}_{col}",
                (cell_w * 0.93, 0.018, cell_l * 0.93),
                (x, -0.038, z),
                SOLAR_BACK,
                SOLAR_COL,
                parent=root,
                bevel=0.006,
            )
            box(
                f"{name}_RearBusbar_{row}_{col}",
                (0.045, 0.018, cell_l * 0.88),
                (x, -0.054, z),
                SOLAR_FRAME,
                SOLAR_COL,
                parent=root,
                bevel=0.004,
            )
    width = cols * cell_w + (cols - 1) * gap
    length = rows * cell_l + (rows - 1) * gap
    box(f"{name}_TopFrame", (width + 0.24, 0.12, 0.12), (0, 0.02, length / 2 + 0.08), SOLAR_FRAME, SOLAR_COL, parent=root, bevel=0.02)
    box(f"{name}_BottomFrame", (width + 0.24, 0.12, 0.12), (0, 0.02, -length / 2 - 0.08), SOLAR_FRAME, SOLAR_COL, parent=root, bevel=0.02)
    box(f"{name}_LeftFrame", (0.12, 0.12, length + 0.24), (-width / 2 - 0.08, 0.02, 0), SOLAR_FRAME, SOLAR_COL, parent=root, bevel=0.02)
    box(f"{name}_RightFrame", (0.12, 0.12, length + 0.24), (width / 2 + 0.08, 0.02, 0), SOLAR_FRAME, SOLAR_COL, parent=root, bevel=0.02)
    box(f"{name}_Mast", (0.16, 0.16, length + 1.0), (0, -0.12, 0), METAL, SOLAR_COL, parent=root, bevel=0.025)
    box(f"{name}_CenterYoke", (width + 0.8, 0.2, 0.28), (0, -0.18, 0), SOLAR_FRAME, SOLAR_COL, parent=root, bevel=0.035)
    cyl(f"{name}_RotaryJoint", 0.32, 0.5, (0, -0.35, 0), (math.pi / 2, 0, 0), METAL, SOLAR_COL, vertices=24, bevel=0.025, parent=root)
    for row in range(rows):
        z = (row - (rows - 1) / 2) * (cell_l + gap)
        box(f"{name}_RearCrossBrace_{row}", (width + 0.08, 0.055, 0.07), (0, -0.072, z), METAL, SOLAR_COL, parent=root, bevel=0.008)
        box(f"{name}_RearJunctionBox_{row}", (0.32, 0.13, 0.24), (0, -0.13, z + cell_l * 0.30), DARK, SOLAR_COL, parent=root, bevel=0.022)


def core_solar_wing(name, side, z_position):
    """Tianhe's shorter two-row rigid wing, modelled separately from the lab blankets."""
    root = bpy.data.objects.new(name, None)
    SOLAR_COL.objects.link(root)
    root.location = (0, 1.24, z_position)
    columns = 7
    cell_length = 1.02
    cell_height = 1.20
    gap = 0.10
    inner_edge = 2.52
    for row in (-1, 1):
        local_z = row * (cell_height + gap) * 0.5
        for column in range(columns):
            local_x = side * (inner_edge + cell_length * 0.5 + column * (cell_length + gap))
            box(
                f"{name}_Cell_{row}_{column}",
                (cell_length, 0.055, cell_height),
                (local_x, 0, local_z),
                SOLAR_CORE,
                SOLAR_COL,
                parent=root,
                bevel=0.008,
            )
            box(
                f"{name}_CellGrid_{row}_{column}",
                (0.018, 0.014, cell_height * 0.94),
                (local_x, 0.038, local_z),
                SOLAR_GRID,
                SOLAR_COL,
                parent=root,
                bevel=0,
            )
            box(
                f"{name}_Backsheet_{row}_{column}",
                (cell_length * 0.93, 0.018, cell_height * 0.92),
                (local_x, -0.038, local_z),
                SOLAR_BACK,
                SOLAR_COL,
                parent=root,
                bevel=0.006,
            )
            box(
                f"{name}_RearBusbar_{row}_{column}",
                (cell_length * 0.86, 0.018, 0.035),
                (local_x, -0.054, local_z),
                SOLAR_FRAME,
                SOLAR_COL,
                parent=root,
                bevel=0.004,
            )

    outer_edge = inner_edge + columns * (cell_length + gap) - gap
    center_x = side * (inner_edge + outer_edge) * 0.5
    span = outer_edge - inner_edge
    box(f"{name}_CenterSpar", (span, 0.13, 0.11), (center_x, -0.09, 0), METAL, SOLAR_COL, parent=root, bevel=0.015)
    for edge_z in (-cell_height - gap * 0.5, cell_height + gap * 0.5):
        box(f"{name}_Edge_{edge_z:.2f}", (span, 0.09, 0.08), (center_x, 0.01, edge_z), SOLAR_FRAME, SOLAR_COL, parent=root, bevel=0.012)
    cyl(f"{name}_RotaryJoint", 0.30, 0.48, (side * 2.22, -0.22, 0), (0, math.pi / 2, 0), METAL, SOLAR_COL, vertices=24, bevel=0.02, parent=root)
    for column in range(columns):
        local_x = side * (inner_edge + cell_length * 0.5 + column * (cell_length + gap))
        box(f"{name}_RearRib_{column}", (0.055, 0.055, cell_height * 2.08), (local_x, -0.072, 0), METAL, SOLAR_COL, parent=root, bevel=0.006)
        if column % 2 == 0:
            box(f"{name}_RearJunctionBox_{column}", (0.24, 0.13, 0.26), (local_x, -0.13, 0), DARK, SOLAR_COL, parent=root, bevel=0.018)


def cylinder_between(name, start, end, radius, mat, col=EQUIP):
    start, end = Vector(start), Vector(end)
    direction = end - start
    mid = (start + end) * 0.5
    obj = cyl(name, radius, direction.length, mid, (0, 0, 0), mat, col, vertices=16, bevel=0.02)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    return obj


def add_arm(name, points, compact=False):
    """Articulated exterior arm with insulated booms, rotary joints, harnesses and end effectors."""
    arm_points = [Vector(point) for point in points]
    boom_radius = 0.105 if compact else 0.145
    collar_radius = 0.145 if compact else 0.195
    joint_radius = 0.205 if compact else 0.285
    joint_depth = 0.34 if compact else 0.46

    for index in range(len(arm_points) - 1):
        start, end = arm_points[index], arm_points[index + 1]
        direction = (end - start).normalized()
        segment_length = (end - start).length
        inset = min(0.24 if compact else 0.32, segment_length * 0.14)
        boom_start = start + direction * inset
        boom_end = end - direction * inset

        cylinder_between(f"{name}_InsulatedBoom_{index}", boom_start, boom_end, boom_radius, BODY_LIGHT)
        cylinder_between(
            f"{name}_RootCollar_{index}",
            start + direction * (inset * 0.58),
            start + direction * (inset * 1.26),
            collar_radius,
            MLI_SILVER,
        )
        cylinder_between(
            f"{name}_TipCollar_{index}",
            end - direction * (inset * 1.26),
            end - direction * (inset * 0.58),
            collar_radius,
            MLI_SILVER,
        )

        # Thermal bands and an exposed data/power harness break up the plain tube silhouette.
        for band_index, factor in enumerate((0.31, 0.68)):
            center = boom_start + (boom_end - boom_start) * factor
            half_span = direction * (0.055 if compact else 0.075)
            cylinder_between(f"{name}_ThermalBand_{index}_{band_index}", center - half_span, center + half_span, boom_radius * 1.09, THERMAL)

        cable_offset = Vector((0, 0.12 if compact else 0.17, 0.07 if index % 2 else -0.07))
        cylinder_between(f"{name}_CableHarness_{index}", boom_start + cable_offset, boom_end + cable_offset, 0.022 if compact else 0.03, CABLE)
        for clamp_index, factor in enumerate((0.18, 0.50, 0.82)):
            clamp_center = boom_start + (boom_end - boom_start) * factor
            half_span = direction * (0.035 if compact else 0.045)
            cylinder_between(f"{name}_HarnessClamp_{index}_{clamp_index}", clamp_center - half_span, clamp_center + half_span, boom_radius * 1.12, METAL)

    for index, point in enumerate(arm_points):
        axis_start = point + Vector((0, -joint_depth * 0.5, 0))
        axis_end = point + Vector((0, joint_depth * 0.5, 0))
        cylinder_between(f"{name}_RotaryJointHousing_{index}", axis_start, axis_end, joint_radius, BODY_LIGHT)
        cylinder_between(
            f"{name}_RotaryJointFrontCap_{index}",
            point + Vector((0, joint_depth * 0.48, 0)),
            point + Vector((0, joint_depth * 0.64, 0)),
            joint_radius * 0.78,
            DARK,
        )
        cylinder_between(
            f"{name}_RotaryJointRearCap_{index}",
            point + Vector((0, -joint_depth * 0.48, 0)),
            point + Vector((0, -joint_depth * 0.64, 0)),
            joint_radius * 0.78,
            DARK,
        )
        box(
            f"{name}_JointFork_{index}",
            (joint_radius * 1.36, joint_depth * 0.72, joint_radius * 0.48),
            (point.x, point.y, point.z - joint_radius * 0.62),
            METAL,
            EQUIP,
            bevel=0.035,
        )
        box(
            f"{name}_JointCamera_{index}",
            (0.095 if compact else 0.12, 0.075, 0.09 if compact else 0.11),
            (point.x + joint_radius * 0.58, point.y + joint_depth * 0.55, point.z + joint_radius * 0.18),
            WINDOW,
            EQUIP,
            bevel=0.018,
        )

    # Both ends use symmetric grapple fixtures, matching the arm's end-for-end operating concept.
    endpoint_specs = (
        (arm_points[0], -(arm_points[1] - arm_points[0]).normalized(), "Base"),
        (arm_points[-1], (arm_points[-1] - arm_points[-2]).normalized(), "Tip"),
    )
    for point, outward, suffix in endpoint_specs:
        fixture_start = point + outward * (joint_radius * 0.72)
        fixture_end = point + outward * (joint_radius * 1.72)
        cylinder_between(f"{name}_{suffix}EffectorNeck", fixture_start, fixture_end, joint_radius * 0.55, MLI_SILVER)
        face_end = fixture_end + outward * (0.09 if compact else 0.12)
        cylinder_between(f"{name}_{suffix}EffectorFace", fixture_end, face_end, joint_radius * 0.74, DARK)

        side_axis = outward.cross(Vector((0, 1, 0)))
        if side_axis.length < 0.01:
            side_axis = outward.cross(Vector((1, 0, 0)))
        side_axis.normalize()
        up_axis = outward.cross(side_axis).normalized()
        for finger_index in range(3):
            finger_angle = finger_index * math.tau / 3
            radial = side_axis * math.cos(finger_angle) + up_axis * math.sin(finger_angle)
            finger_start = face_end + radial * joint_radius * 0.58
            finger_end = face_end + outward * (0.18 if compact else 0.24) + radial * joint_radius * 0.42
            cylinder_between(f"{name}_{suffix}GrappleFinger_{finger_index}", finger_start, finger_end, 0.022 if compact else 0.03, METAL)


def add_hotspot(name, module_id, position, radius=2.6):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=position)
    obj = move_to(bpy.context.object, HOTSPOTS)
    obj.name = name
    obj.hide_render = True
    obj.display_type = "WIRE"
    obj["moduleId"] = module_id


def add_dish(name, location, scale=1.0, rotation=(0, 0, 0)):
    root = bpy.data.objects.new(name, None)
    EQUIP.objects.link(root)
    root.location = location
    root.rotation_euler = rotation
    cyl(f"{name}_Mast", 0.055 * scale, 1.2 * scale, (0, 0, 0.5 * scale), mat=METAL, col=EQUIP, vertices=12, parent=root)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=(0, 0, 1.14 * scale), scale=(0.58 * scale, 0.58 * scale, 0.13 * scale))
    dish = move_to(bpy.context.object, EQUIP)
    dish.name = f"{name}_Reflector"
    dish.data.materials.append(BODY_LIGHT)
    dish.parent = root
    smooth(dish)
    cyl(f"{name}_Feed", 0.035 * scale, 0.4 * scale, (0, 0, 1.4 * scale), mat=GOLD, col=EQUIP, vertices=12, parent=root)


def add_truss(name, center, size):
    sx, sy, sz = size
    cx, cy, cz = center
    corners = [(cx + x * sx / 2, cy + y * sy / 2, cz + z * sz / 2) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    edges = []
    for i, a in enumerate(corners):
        for j, b in enumerate(corners[i + 1:], start=i + 1):
            diff = sum(abs(a[k] - b[k]) > 0.001 for k in range(3))
            if diff == 1:
                edges.append((a, b))
    for index, (a, b) in enumerate(edges):
        cylinder_between(f"{name}_Edge_{index}", a, b, 0.055, METAL)
    # Diagonal braces on the visible long faces.
    for side in (-1, 1):
        cylinder_between(f"{name}_Brace_{side}_A", (cx - sx / 2, cy + side * sy / 2, cz - sz / 2), (cx + sx / 2, cy + side * sy / 2, cz + sz / 2), 0.035, METAL)
        cylinder_between(f"{name}_Brace_{side}_B", (cx - sx / 2, cy + side * sy / 2, cz + sz / 2), (cx + sx / 2, cy + side * sy / 2, cz - sz / 2), 0.035, METAL)


def add_visiting_vehicle(name, z_position, direction=1, cargo=False):
    root = bpy.data.objects.new(name, None)
    EXT.objects.link(root)
    root.location = (0, 0, z_position)
    root["vehicleType"] = "cargo" if cargo else "crew"
    pressure_radius = 1.42 if cargo else 1.08
    pressure_length = 3.05 if cargo else 2.05
    pressure_center = direction * (pressure_length * 0.5 + 0.18)
    cyl(f"{name}_PressurizedModule", pressure_radius, pressure_length, (0, 0, pressure_center), mat=BODY_LIGHT, col=EXT, parent=root, bevel=0.05)
    torus(f"{name}_PressurizedBandA", pressure_radius * 1.01, 0.04, (0, 0, direction * 0.72), mat=MLI_SILVER, parent=root)
    torus(f"{name}_PressurizedBandB", pressure_radius * 1.01, 0.04, (0, 0, direction * (pressure_length - 0.28)), mat=MLI_SILVER, parent=root)

    transition_center = direction * (3.45 if cargo else 2.82)
    cone(
        f"{name}_ReturnOrCargoTaper",
        pressure_radius * (0.84 if direction > 0 else 0.62),
        pressure_radius * (0.62 if direction > 0 else 0.84),
        1.35,
        (0, 0, transition_center),
        mat=THERMAL,
        parent=root,
    )
    service_center = direction * (4.85 if cargo else 4.55)
    service_radius = 1.22 if cargo else 1.18
    cyl(f"{name}_ServiceModule", service_radius, 2.0, (0, 0, service_center), mat=BODY, col=EXT, parent=root, bevel=0.045)
    torus(f"{name}_DockingRing", 0.76, 0.10, (0, 0, 0), mat=METAL, parent=root)
    axial_port(f"{name}_OuterPort", root, direction * 6.0, 0.72, direction)
    for angle in (0, math.pi / 2, math.pi, math.pi * 1.5):
        box(
            f"{name}_Thruster_{angle:.2f}",
            (0.22, 0.22, 0.48),
            (math.cos(angle) * service_radius * 0.94, math.sin(angle) * service_radius * 0.94, service_center + direction * 0.52),
            DARK,
            EQUIP,
            parent=root,
            bevel=0.04,
        )
    for index, axial in enumerate((pressure_center - direction * 0.58, pressure_center + direction * 0.46, service_center)):
        radial_box(
            f"{name}_RearAvionics_{index}",
            root,
            pressure_radius if index < 2 else service_radius,
            math.pi * 1.5 + (index - 1) * 0.24,
            axial,
            0.46 + index * 0.08,
            0.16,
            0.38 + (index % 2) * 0.18,
            MLI_SILVER if index == 0 else DARK,
            bevel=0.028,
        )
    array_z = z_position + service_center
    solar_array(f"{name}_Solar_Left", (-3.15, 0.72, array_z), True, rotation=(0, math.pi / 2, 0))
    solar_array(f"{name}_Solar_Right", (3.15, 0.72, array_z), True, rotation=(0, math.pi / 2, 0))
    cylinder_between(f"{name}_SolarBoom_Left", (-service_radius, 0.1, array_z), (-2.5, 0.72, array_z), 0.07, METAL)
    cylinder_between(f"{name}_SolarBoom_Right", (service_radius, 0.1, array_z), (2.5, 0.72, array_z), 0.07, METAL)


def add_external_equipment():
    # Central communications package; lab-specific payload equipment lives on its own module.
    for index, position in enumerate(((-2.2, 2.2, -5.0), (2.4, 2.0, -7.5), (-1.1, 2.35, -11.0))):
        add_dish(f"STA_Core_Antenna_{index}", position, 0.5 + index * 0.08, rotation=(0.1, 0.1 * index, 0))
    for index in range(10):
        angle = index * math.tau / 10
        box(
            f"STA_Node_Equipment_{index}",
            (0.42, 0.34, 0.55),
            (math.cos(angle) * 2.75, 1.05 + math.sin(angle) * 0.8, math.sin(angle) * 2.2),
            DARK if index % 2 else METAL,
            EQUIP,
            rotation=(0, angle, 0),
            bevel=0.035,
        )


def add_central_node_detail():
    # The transfer node is compact in nadir imagery; an oversized sphere made
    # the entire assembly read as a toy.  A squat rounded pressure vessel gives
    # the correct hierarchy against the 4.2 m laboratory cabins.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1.72, location=(0, 0, 0))
    node = move_to(bpy.context.object, EXT)
    node.name = "STA_Central_Node_V5"
    node.scale = (1.04, 0.94, 1.12)
    node.data.materials.append(BODY_LIGHT)
    smooth(node)

    cyl("STA_Central_NodeBarrel", 1.58, 2.62, (0, 0, 0), mat=BODY_LIGHT, col=EXT, bevel=0.055)
    for z_pos in (-1.18, 0, 1.18):
        torus(f"STA_Central_NodeBarrelBand_{z_pos:.2f}", 1.60, 0.045, (0, 0, z_pos), mat=MLI_SILVER)

    for index, angle in enumerate((0, math.pi / 2, math.pi, math.pi * 1.5)):
        start = (math.cos(angle) * 1.46, 0, math.sin(angle) * 1.46)
        end = (math.cos(angle) * 2.88, 0, math.sin(angle) * 2.88)
        cylinder_between(f"STA_Central_PortSleeve_{index}", start, end, 0.66, BODY)
        radial = Vector((math.cos(angle), 0, math.sin(angle)))
        collar_center = Vector(end) + radial * 0.08
        puck = cyl(
            f"STA_Central_PortFace_{index}",
            0.52,
            0.12,
            collar_center,
            mat=DARK,
            col=EXT,
            vertices=40,
            bevel=0.02,
        )
        puck.rotation_mode = "QUATERNION"
        puck.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(radial)
        for bolt_index in range(8):
            bolt_angle = bolt_index * math.tau / 8
            bolt_position = collar_center + Vector((0, math.cos(bolt_angle) * 0.55, math.sin(bolt_angle) * 0.55))
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.055, location=bolt_position)
            bolt = move_to(bpy.context.object, EQUIP)
            bolt.name = f"STA_Central_PortBolt_{index}_{bolt_index}"
            bolt.data.materials.append(METAL)

    for index, angle in enumerate((0.45, 1.35, 2.2, 3.9, 4.85, 5.65)):
        box(
            f"STA_Central_NodeService_{index}",
            (0.42, 0.22, 0.52),
            (math.cos(angle) * 1.66, 1.04 + math.sin(angle) * 0.30, math.sin(angle) * 1.66),
            GOLD if index % 2 else DARK,
            EQUIP,
            rotation=(0, angle, 0),
            bevel=0.035,
        )

    cyl("STA_Central_NadirPortCollar", 0.78, 0.52, (0, -1.72, 0), (math.pi / 2, 0, 0), MLI_SILVER, EXT, vertices=48, bevel=0.025)
    cyl("STA_Central_NadirPortFace", 0.61, 0.12, (0, -2.03, 0), (math.pi / 2, 0, 0), DARK, EXT, vertices=48, bevel=0.018)
    torus("STA_Central_NadirLatchingRing", 0.69, 0.065, (0, -2.10, 0), (math.pi / 2, 0, 0), METAL)
    for index, (x_pos, z_pos) in enumerate(((-1.03, -0.72), (1.04, -0.58), (-1.12, 0.63), (1.08, 0.76))):
        box(
            f"STA_Central_RearService_{index}",
            (0.42 + 0.08 * (index % 2), 0.20, 0.50),
            (x_pos, -1.32, z_pos),
            GOLD if index % 3 == 0 else (DARK if index % 3 == 1 else MLI_SILVER),
            EQUIP,
            bevel=0.03,
        )
    for index, z_pos in enumerate((-1.12, -0.58, 0.58, 1.12)):
        cylinder_between(f"STA_Central_RearHarness_{index}", (-1.28, -1.46, z_pos), (1.28, -1.46, z_pos + 0.14), 0.035, CABLE)


def add_forward_node():
    cyl("STA_Forward_Node_Shell", 1.46, 3.48, (0, 0, 3.42), mat=BODY_LIGHT, col=EXT, bevel=0.05)
    cone("STA_Forward_Node_Taper", 1.46, 0.98, 1.34, (0, 0, 5.82), mat=BODY)
    cyl("STA_Forward_Docking_Collar", 0.84, 0.42, (0, 0, 6.64), mat=DARK, col=EXT, bevel=0.025)
    torus("STA_Forward_Docking_Ring", 0.84, 0.105, (0, 0, 6.86), mat=METAL)
    for index, z_pos in enumerate((2.02, 2.88, 3.76, 4.66)):
        torus(f"STA_Forward_Node_Band_{index}", 1.47, 0.042, (0, 0, z_pos), mat=MLI_SILVER)
        for side in (-1, 1):
            box(
                f"STA_Forward_Node_Equipment_{index}_{side}",
                (0.35, 0.28, 0.42),
                (side * 1.16, 1.04, z_pos + side * 0.18),
                GOLD if index != 1 else DARK,
                EQUIP,
                bevel=0.035,
            )
    for index, angle in enumerate((0, math.pi / 2, math.pi, math.pi * 1.5)):
        radial_disc(f"STA_Forward_NodeSensor_{index}", None, 1.46, angle, 3.5 + (index % 2) * 0.86, 0.11, 0.075, WINDOW, EXT)
    for index, z_pos in enumerate((2.46, 3.42, 4.38)):
        box(f"STA_Forward_RearAvionics_{index}", (0.52, 0.18, 0.42), (-0.48 + index * 0.46, -1.38, z_pos), DARK if index % 2 else MLI_SILVER, EQUIP, bevel=0.028)
        box(f"STA_Forward_RearCableClamp_{index}", (1.82, 0.055, 0.07), (0, -1.49, z_pos + 0.27), CABLE, EQUIP, bevel=0.01)


def add_tianhe_marking(tianhe):
    flag_center = (0, 2.158, 0.10)
    box("STA_Tianhe_ChineseFlag_Mount", (2.34, 0.042, 1.42), (0, 2.115, 0.10), BODY_LIGHT, EQUIP, parent=tianhe, bevel=0.025)
    box("STA_Tianhe_ChineseFlag_Field", (2.12, 0.058, 1.22), flag_center, FLAG_RED, EQUIP, parent=tianhe, bevel=0.014)
    surface_y = 2.192
    star("STA_Tianhe_ChineseFlag_LargeStar", (0.67, surface_y, 0.23), 0.255, math.pi / 2, parent=tianhe)
    small_stars = (
        ((0.27, surface_y, 0.41), 0.40),
        ((0.12, surface_y, 0.19), 0.12),
        ((0.14, surface_y, -0.06), -0.16),
        ((0.34, surface_y, -0.24), -0.42),
    )
    for index, (position, rotation) in enumerate(small_stars):
        star(f"STA_Tianhe_ChineseFlag_SmallStar_{index}", position, 0.098, rotation, parent=tianhe)


def build():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for col in list(bpy.data.collections):
        if col.name != "Collection" and col.users == 0:
            bpy.data.collections.remove(col)

    tianhe = module("STA_Tianhe_Exterior", "tianhe", (0, 0, -9.35), "z", 16.6, 2.1)
    wentian = module("STA_Wentian_Exterior", "wentian", (-9.25, 0, 0), "x", 17.9, 2.1)
    mengtian = module("STA_Mengtian_Exterior", "mengtian", (9.25, 0, 0), "x", 17.9, 2.1)
    add_tianhe_structure(tianhe)
    add_wentian_structure(wentian)
    add_mengtian_structure(mengtian)
    add_tianhe_marking(tianhe)

    # Central node and the forward/aft spine.
    add_central_node_detail()
    add_forward_node()
    cyl("STA_Central_TransferTunnel", 0.78, 3.10, (0, 0, -1.25), mat=BODY, col=EXT, bevel=0.04)
    torus("STA_Central_TransferTunnelBand", 0.80, 0.06, (0, 0, -2.55), mat=METAL)

    # The uploaded nadir references show the operational assembly with a crew
    # vehicle at the forward port and a cargo vehicle at Tianhe's aft port.
    add_visiting_vehicle("STA_Forward_Shenzhou", 6.92, 1, cargo=False)
    add_visiting_vehicle("STA_Aft_Tianzhou", -19.58, -1, cargo=True)

    solar_array("STA_Solar_Array_Lower_Left", (-20.8, 1.28, -10.0))
    solar_array("STA_Solar_Array_Upper_Left", (-20.8, 1.28, 10.0))
    solar_array("STA_Solar_Array_Lower_Right", (20.8, 1.28, -10.0))
    solar_array("STA_Solar_Array_Upper_Right", (20.8, 1.28, 10.0))
    core_solar_wing("STA_Solar_Array_Core_Left", -1, -11.45)
    core_solar_wing("STA_Solar_Array_Core_Right", 1, -11.45)
    for side in (-1, 1):
        for z_offset in (-10.0, 10.0):
            cylinder_between(
                f"STA_Lab_SolarBoom_{side}_{z_offset}",
                (side * 18.05, 0.25, z_offset),
                (side * 19.75, 1.22, z_offset),
                0.11,
                METAL,
            )
        cylinder_between(f"STA_Core_SolarBoom_{side}", (side * 2.0, 0.2, -11.45), (side * 2.5, 1.20, -11.45), 0.09, METAL)

    add_arm("STA_Large_Robotic_Arm", [(-1.25, 2.05, -0.72), (-3.35, 2.88, -1.55), (-6.05, 2.62, -1.34), (-8.42, 2.25, -0.48)])
    add_arm("STA_Small_Robotic_Arm", [(1.18, 1.96, -0.36), (2.72, 2.62, 0.34), (4.42, 2.38, -0.46)], compact=True)

    add_external_equipment()
    add_hotspot("HOTSPOT_Module_Tianhe", "tianhe", (0, 0, -10.2), 3.35)
    add_hotspot("HOTSPOT_Module_Wentian", "wentian", (-9.25, 0, 0), 2.7)
    add_hotspot("HOTSPOT_Module_Mengtian", "mengtian", (9.25, 0, 0), 2.7)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.unit_settings.scale_length = 1.0
    scene.world.color = (0.02, 0.055, 0.075)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB", use_selection=True, export_apply=True, export_materials="EXPORT")
    print(f"Exported {GLB_PATH}")


build()
