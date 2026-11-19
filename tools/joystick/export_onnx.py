"""Export a fixed-window G1 Joystick using the upstream offline generator.

Run with the pinned Joystick environment. Extra args after -- are the ordinary
offline_generation.py arguments. Use the same idle --initial-source-id as the
reference samples. The product is a private candidate pending parity checks.
"""
import argparse
import json
from pathlib import Path
import runpy
import sys
import torch


def exporter(frame, destination):
    local = frame.f_locals
    engine = local["engine"]
    g, l = local["g"], local["l"]
    dual, extract = local["dual"], local["extract"]
    context, start = local["input_context"], local["start_pos"]
    align_target = local["align_target"]
    categories, prompts = [], []
    for name, entry in local["bank_receipt"].items():
        phases = [p for p in entry["phases"] if p["name"] in ("left_support", "right_support")]
        phase = (phases or entry["phases"])[0]["frame25"]
        prompts.append(local["read"](entry["row"], phase, count=5))
        categories.append(name)
    context_local = local["local_context"]
    mask, local_mask = torch.ones((1, 8), dtype=torch.bool, device=context.device), local["local_mask"]

    class Window(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.engine = engine
            self.register_buffer("prompts", torch.cat(prompts))

        def forward(self, velocity, category):
            prompt = torch.index_select(self.prompts, 0, category)
            goal, target = align_target(g, dual, prompt, start, velocity, 64, 25)
            boundary = torch.cat((context, goal), dim=1)
            local_boundary = torch.cat((context_local, target), dim=1)
            prediction, _ = self.engine.predict(
                extract(boundary, g, "root"), mask, extract(local_boundary, l, "root"),
                local_mask, extract(local_boundary, l, "joint_positions_and_rotations"),
                mask, 16, config={"pose_token_sampling_use_argmax": True,
                                  "num_inference_step": 4, "final_root_pred_mode": "from_root_module"},
                info={})
            inverse = g.inverse(prediction[:, 4:64], is_normalized=False)
            joints = inverse["posed_joints"][0, ..., [2, 0, 1]]
            delta = inverse["global_joint_rots"][0]
            basis = delta.new_tensor([[0, 1, 0], [0, 0, 1], [1, 0, 0]])
            rest = g.skeleton.rest_global_rotations.to(delta)
            world_rotations = basis.T @ delta @ basis @ rest
            return joints, world_rotations

    # Unroll the fixed G1 topology. TorchScript's tensor-list FK otherwise
    # exports as a SequenceAt with unknown integer element type in ONNX.
    from motionbricks.motionlib.core.utils import torch_utils
    parent_ids = local["parent_ids"]

    def fixed_fk(rotations, joints, _parents, _levels, root_idx):
        assert root_idx == 0
        positions, world = [joints[:, 0]], [rotations[:, 0]]
        for i, parent in enumerate(parent_ids[1:], 1):
            offset = joints[:, i] - joints[:, parent]
            positions.append(positions[parent] + (world[parent] @ offset.unsqueeze(-1)).squeeze(-1))
            world.append(world[parent] @ rotations[:, i])
        return torch.stack(positions, 1), torch.stack(world, 1)

    torch_utils.forward_kinematics = fixed_fk
    joint_names = list(local["names"])
    model = Window().eval()
    velocity = local["cmd"]
    index = torch.tensor([categories.index(local["a"].category)], device=context.device)
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "signature.json").write_text(json.dumps({
        "categories": categories, "jointNames": joint_names, "fps": 25, "frames": 60,
        "inputs": ["velocity", "category"], "outputs": ["positions", "world_rotations"]}, indent=2))
    # Native fastpaths fuse attention into unexportable platform-specific ops.
    torch.backends.mha.set_fastpath_enabled(False)
    torch.onnx.register_custom_op_symbolic("aten::lift_fresh", lambda graph, value: value, 18)
    torch.onnx.export(model, (velocity, index), str(destination / "raw.onnx"),
                      input_names=["velocity", "category"], output_names=["positions", "world_rotations"],
                      opset_version=18, dynamo=False)
    from repair_export import fix_feature_assignments
    fix_feature_assignments(destination / "raw.onnx", destination / "joystick.onnx")
    (destination / "raw.onnx").unlink()



def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("upstream", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("generator_args", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    source = args.upstream.resolve() / "tools/offline_generation.py"
    # Use the exact setup/conditioning code from the pinned generator without
    # adding export dependencies or modifications to the source repository.
    trigger = next(i for i, s in enumerate(source.read_text().splitlines(), 1)
                   if "out, n = engine.predict(" in s)

    def trace(frame, event, arg):
        if event == "call":
            return trace if frame.f_code.co_filename == str(source) else None
        if event == "line" and frame.f_lineno == trigger:
            sys.settrace(None)
            exporter(frame, args.destination)
            raise SystemExit(0)
        return trace

    sys.argv = [str(source), *[a for a in args.generator_args if a != "--"]]
    sys.settrace(trace)
    runpy.run_path(str(source), run_name="__main__")


if __name__ == "__main__":
    main()
