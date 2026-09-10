from hivemind_worker.agent.main import disk_quotas_supported

INFO = {
    "Driver": "overlay2",
    "DockerRootDir": "/var/lib/docker",
    "DriverStatus": [["Backing Filesystem", "xfs"], ["Supports d_type", "true"]],
}


def test_quotas_need_overlay2_on_xfs_with_project_quotas() -> None:
    mounts = "/dev/nvme0n1p2 / ext4 rw,relatime 0 0\n/dev/nvme0n1p3 /var/lib/docker xfs rw,prjquota 0 0\n"
    assert disk_quotas_supported(INFO, mounts)
    assert not disk_quotas_supported(INFO, mounts.replace(",prjquota", ""))
    assert not disk_quotas_supported({**INFO, "Driver": "btrfs"}, mounts)
    ext4 = {**INFO, "DriverStatus": [["Backing Filesystem", "extfs"]]}
    assert not disk_quotas_supported(ext4, mounts)
    # Root on xfs with quotas, no separate docker mount: the longest prefix wins.
    root_only = "/dev/sda1 / xfs rw,prjquota 0 0\n"
    assert disk_quotas_supported(INFO, root_only)
