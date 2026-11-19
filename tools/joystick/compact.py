"""Convert large FP32 initializers to weight-only FP16 or blockwise symmetric INT8."""
import argparse
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper


def convert(source, destination, precision):
    model = onnx.load(source)
    graph = model.graph
    consumers = {value: node.name for node in graph.node for value in node.input}
    transforms = []
    for tensor in list(graph.initializer):
        if tensor.data_type != TensorProto.FLOAT or len(tensor.raw_data) < 65536:
            continue
        name = tensor.name
        weights = numpy_helper.to_array(tensor)
        packed = name + "_packed"
        if precision == "fp16" or (precision == "mixed" and "/_transformer_model/" not in consumers.get(name, "")):
            stored = weights.astype(np.float16)
            transforms.append(helper.make_node("Cast", [packed], [name], to=TensorProto.FLOAT))
        else:
            if weights.size % 32:
                continue
            blocks = weights.reshape(-1, 32)
            limit = {"int10": 511, "int12": 2047}.get(precision, 127)
            scales = np.max(np.abs(blocks), axis=1, keepdims=True) / limit
            scales[scales == 0] = 1
            stored = np.rint(blocks / scales).clip(-limit, limit).astype(np.float16 if limit > 127 else np.int8)
            graph.initializer.extend([
                numpy_helper.from_array(scales, name + "_scale"),
                numpy_helper.from_array(np.array(weights.shape, np.int64), name + "_shape"),
            ])
            transforms.extend([
                helper.make_node("Cast", [packed], [name + "_float"], to=TensorProto.FLOAT),
                helper.make_node("Mul", [name + "_float", name + "_scale"], [name + "_blocks"]),
                helper.make_node("Reshape", [name + "_blocks", name + "_shape"], [name]),
            ])
        tensor.CopyFrom(numpy_helper.from_array(stored, packed))
    original = list(graph.node)
    del graph.node[:]
    graph.node.extend(transforms)
    graph.node.extend(original)
    onnx.checker.check_model(model)
    onnx.save(model, destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("precision", choices=["int8", "fp16", "mixed", "int10", "int12"])
    args = parser.parse_args()
    convert(args.source, args.destination, args.precision)
