"""Rectilinear virtual observation camera shared by the recorded G1 trials."""
import numpy as np

VERTICAL_FOV = 48

def stabilize(data, camera_id):
    """Keep the measured optical center and yaw, level roll and tilt down 11°."""
    heading = -data.cam_xmat[camera_id].reshape(3,3)[:,2]
    yaw = np.arctan2(heading[1],heading[0])
    c,s = np.cos(yaw),np.sin(yaw)
    pitch = np.deg2rad(11)
    right = np.array([s,-c,0.])
    up = np.array([c*np.sin(pitch),s*np.sin(pitch),np.cos(pitch)])
    data.cam_xmat[camera_id] = np.column_stack([right,up,np.cross(right,up)]).ravel()
