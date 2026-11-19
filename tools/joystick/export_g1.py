"""Build the browser's G1 visual model from its MJCF and source OBJ meshes.

Run with Blender's Python: blender -b -P export_g1.py -- XML samples.json g1.glb
Only rigid visual geometry is exported. Each top-level node has the exact name
of the body animated by the Joystick decoder. Fixed child offsets and MJCF
visual offsets remain in its local geometry.
"""
import hashlib
import json
from pathlib import Path
import sys
from xml.etree import ElementTree as ET

import bpy
from mathutils import Matrix, Quaternion, Vector


def local_transform(node):
    xyz = Vector([float(x) for x in node.get("pos", "0 0 0").split()])
    rot = Quaternion([float(x) for x in node.get("quat", "1 0 0 0").split()])
    return Matrix.Translation(xyz) @ rot.to_matrix().to_4x4()


def make_material(name, color, metal, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    for key, val in {"Base Color": (*color, 1), "Metallic": metal,
                     "Roughness": roughness, "Coat Weight": .18}.items():
        bsdf.inputs[key].default_value = val
    return mat


def build(xml, manifest, destination):
    record = json.loads(manifest.read_text())
    assert hashlib.sha256(xml.read_bytes()).hexdigest() == record["xmlSha256"]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = ET.parse(xml).getroot()
    meshes = {m.get("name"): xml.parent / m.get("file") for m in root.findall("asset/mesh")}
    joints = {}
    for name in record["jointNames"]:
        joints[name] = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(joints[name])
    white = make_material("G1 ceramic silver", (.68, .73, .77), .45, .27)
    graphite = make_material("G1 motor housings", (.049, .061, .079), .55, .31)
    visor = make_material("G1 visor", (.043, .062, .088), .63, .16)
    receipts = []

    def visit(body, joint=None, offset=None):
        name = body.get("name")
        if name in joints:
            joint = joints[name]
            offset = Matrix.Identity(4)
        else:
            offset = offset @ local_transform(body)
        for geom in body.findall("geom"):
            if geom.get("type") != "mesh" or (geom.get("group") != "1" and geom.get("class") != "visual"):
                continue
            mesh_name = geom.attrib["mesh"]
            path = meshes[mesh_name]
            if path.suffix.lower()==".stl":
                bpy.ops.wm.stl_import(filepath=str(path))
            else:
                bpy.ops.wm.obj_import(filepath=str(path), forward_axis="Y", up_axis="Z",
                                  use_split_objects=False, use_split_groups=False)
            obj = bpy.context.selected_objects[0]
            obj.name = "visual_" + mesh_name
            obj.parent = joint
            obj.matrix_local = offset @ local_transform(geom)
            shade = float(geom.get("rgba", ".7 .7 .7 1").split()[0])
            obj.data.materials.clear()
            obj.data.materials.append(visor if mesh_name == "head_link" else
                                      white if shade > .5 else graphite)
            receipts.append({"mesh": mesh_name, "joint": joint.name, "sourceSha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        for child in body.findall("body"):
            visit(child, joint, offset)

    for body in root.findall("worldbody/body"):
        visit(body)
    assert receipts
    if root.get("model")!="A3T2.5":assert all(j.children or any(r["joint"] == j.name for r in receipts) for j in joints.values() if j.name != "waist_yaw_link")
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB", export_yup=True,
                              export_materials="EXPORT", export_animations=False,
                              export_extras=False, export_texcoords=False)
    return receipts


if __name__ == "__main__":
    xml, manifest, destination = [Path(s).resolve() for s in sys.argv[sys.argv.index("--")+1:]]
    receipts = build(xml, manifest, destination)
    provenance = {"xmlSha256": hashlib.sha256(xml.read_bytes()).hexdigest(),
                  "asset": xml.parent.name+" visual meshes from the matched SuperMimic XML",
                  "geometry": "Original visual triangles and normals. MJCF fixed-body and geom offsets preserved. Materials relit for studio display.",
                  "modelSha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
                  "meshes": receipts}
    destination.with_suffix(".source.json").write_text(json.dumps(provenance, indent=2)+"\n")
