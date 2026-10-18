import bpy
import math
import os
from mathutils import Vector

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BLEND_PATH = os.path.join(ROOT_DIR, "public", "models", "station-exterior.blend")
REVIEW_DIR = os.path.join(ROOT_DIR, "references", "render-review", "exterior")
OUTPUT_PATH = os.path.join(REVIEW_DIR, "station-blender-preview.png")
REAR_OUTPUT_PATH = os.path.join(REVIEW_DIR, "station-blender-rear.png")

os.makedirs(REVIEW_DIR, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1600
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUTPUT_PATH
scene.render.film_transparent = False
scene.world.color = (0.006, 0.012, 0.024)

for obj in list(scene.objects):
    if obj.type in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(obj, do_unlink=True)

def point_camera(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()

bpy.ops.object.camera_add(location=(16, 78, 45))
camera = bpy.context.object
camera.data.lens = 58
camera.data.sensor_width = 36
point_camera(camera, (0, 0, -4))
scene.camera = camera

def add_sun(energy, location, angle=0.08):
    bpy.ops.object.light_add(type="SUN", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.angle = angle
    light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat("-Z", "Y").to_euler()

add_sun(3.6, (-20, 32, 42), 0.08)
add_sun(1.2, (27, -9, 21), 0.18)
add_sun(0.7, (0, 20, -35), 0.24)

scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.look = "AgX - Medium High Contrast"
bpy.ops.render.render(write_still=True)
print(f"Rendered {OUTPUT_PATH}")

camera.location = (16, -78, 45)
point_camera(camera, (0, 0, -4))
scene.render.filepath = REAR_OUTPUT_PATH
bpy.ops.render.render(write_still=True)
print(f"Rendered {REAR_OUTPUT_PATH}")
