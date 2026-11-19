"""Check contact manifolds at the saved 50 Hz controller states."""
import mujoco as mj


def measure(model, names, states, racks):
    data = mj.MjData(model)
    joints = [model.jnt_qposadr[model.joint(name).id] for name in names]
    rack_ids = {model.geom(name).id for name, *_ in racks}
    touching = 0
    for state in states:
        data.qpos[:7] = state[:7]
        data.qpos[joints] = state[13:13+len(names)]
        mj.mj_forward(model, data)
        touching += any(contact.dist <= 0 and rack_ids.intersection(contact.geom)
                        for contact in data.contact)
    return dict(rackContactSamples=touching, samples=len(states), frequencyHz=50)
