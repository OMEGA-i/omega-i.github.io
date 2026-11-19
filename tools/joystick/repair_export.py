"""Lower legacy exporter X[...,feature_ids] assignments to last-axis ScatterElements."""
from pathlib import Path
import onnx
from onnx import helper
import numpy as np


def fix_feature_assignments(path, output):
    model = onnx.load(path)
    nodes = list(model.graph.node)
    by_output = {o: n for n in nodes for o in n.output}
    result = []
    i = 0
    count = 0
    while i < len(nodes):
        n = nodes[i]
        if n.op_type != "Add" or list(n.input) != ["", ""]:
            result.append(n)
            i += 1
            continue
        # A legacy index_put symbolically treated two leading full axes as
        # optional Add inputs. Validate the lowering pattern before replacing.
        stop = next(j for j in range(i, len(nodes)) if nodes[j].op_type == "ScatterND")
        scatter = nodes[stop]
        index_node = nodes[i + 1]
        assert index_node.op_type == "Constant"
        feature_ids = onnx.numpy_helper.to_array(index_node.attribute[0].t)
        assert feature_ids.ndim == 1 and feature_ids.size in (2,5)
        target = scatter.input[0]
        flat_updates = by_output[scatter.input[2]].input[0]
        prefix = "assign_fixed_features_" + str(count)
        index = prefix + "_indices"
        model.graph.initializer.append(onnx.numpy_helper.from_array(feature_ids.astype(np.int64),index))
        def op(kind, inputs, suffix, **attrs):
            name = prefix + "_" + suffix
            result.append(helper.make_node(kind, inputs, [name], name=name, **attrs))
            return name
        leading = op("Shape", [target], "batch_time", start=0, end=2)
        tail = op("Shape", [index], "channels")
        shape = op("Concat", [leading,tail], "shape", axis=0)
        idx = op("Expand", [index,shape], "expanded")
        updates = op("Reshape", [flat_updates,shape], "updates")
        result.append(helper.make_node("ScatterElements", [target,idx,updates], list(scatter.output),
                                       name=prefix, axis=2))
        count += 1
        i = stop+1
    assert count == 3
    del model.graph.node[:]
    model.graph.node.extend(result)
    onnx.checker.check_model(model)
    onnx.save(model, output)


if __name__ == "__main__":
    import sys
    fix_feature_assignments(Path(sys.argv[1]), Path(sys.argv[2]))
