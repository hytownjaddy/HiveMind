# Home laptop as the lab host (Windows → Ubuntu Server, Wi-Fi only)

A spare x86-64 laptop satisfies D-005 ("home hardware"). This runbook turns a Windows
gaming laptop into the always-on lab worker over Wi-Fi, then hands off to
[lab-host.md](lab-host.md) for the Cloudflare side and the provisioning script. Budget
about an hour, most of it waiting on installers.

Nothing on the laptop is precious afterwards (D-020): if it breaks, wipe it and redo this.

## 0. Before you wipe Windows

- Copy anything you want off the laptop; the disk is erased.
- Write down the laptop's Wi-Fi card (Windows: Device Manager → Network adapters). Intel
  AX2xx/BE2xx and most Realtek/MediaTek cards work with Ubuntu 24.04 out of the box; a few
  exotic cards need a second path for the first download (step 2).
- Have ready: a USB stick (4 GB+), your Wi-Fi SSID and password, and your Mac on the
  same Wi-Fi.
- On the Mac, create the Ubuntu USB:
  1. Download **Ubuntu Server 24.04 LTS** (amd64) from ubuntu.com/download/server.
  2. `diskutil list` to find the stick (for example `/dev/disk4`), then
     `diskutil unmountDisk /dev/disk4` and
     `sudo dd if=~/Downloads/ubuntu-24.04*-live-server-amd64.iso of=/dev/rdisk4 bs=4m status=progress`.
     Use `balenaEtcher` if you prefer a GUI.

## 1. Firmware settings and boot

1. In Windows, turn off BitLocker if it is on (Settings → Privacy & security → Device
   encryption) so the wipe is clean. Optional; the installer erases the disk either way.
2. Reboot into firmware setup (usually F2, Del, or F10 while powering on; gaming laptops
   often show a boot menu on F12).
3. Set: boot from USB first; **Secure Boot can stay enabled** (Ubuntu is signed);
   disable Fast Boot; if there is an **AC power recovery / auto power-on** option, enable it
   so the laptop comes back after a power cut; leave the discrete GPU as is (Ubuntu Server
   never uses it).
4. Boot the stick and choose **Try or Install Ubuntu Server**.

## 2. Installer choices

- Language and keyboard as you like; **Ubuntu Server (minimized)** is fine.
- **Network**: select the Wi-Fi interface (`wlp…`), pick the SSID, enter the password.
  If no Wi-Fi interface appears, the card's firmware is missing on the ISO. Two ways
  through, in order of convenience: plug in your phone by USB and enable USB tethering
  (shows up as `enx…`/`usb0` and works out of the box), or use any USB-to-ethernet adapter.
  Wi-Fi is fixed after install in step 3.
- **Proxy / mirror**: defaults.
- **Storage**: choose **Custom storage layout** so per-lab disk quotas can work:
  - EFI system partition (the installer creates it), 1 GB.
  - `/` as **ext4**, 60 GB.
  - the rest as **xfs**, mounted at `/var/lib/docker` (labs, images, containerlab dirs).
    Skip LVM encryption; there is nothing sensitive on the host and an encrypted disk
    cannot boot unattended after a power cut.
- **Profile**: your name, hostname `lab-worker-1`, username `jacob`, a strong password.
- **SSH**: tick **Install OpenSSH server**, and import your GitHub SSH keys if you keep
  them there (`gh:<your-github-user>`); otherwise you copy a key in step 3.
- **Snaps**: none.
- Reboot when asked, remove the stick.

## 3. First login and Wi-Fi hardening

Log in on the laptop itself once (or over SSH if the installer already joined Wi-Fi):

```bash
ip -br addr                     # note the wlp… address, e.g. 192.168.1.42
sudo apt update && sudo apt full-upgrade -y && sudo reboot
```

If you used tethering during install, put Wi-Fi in netplan now (replace the interface,
SSID, and password):

```bash
sudo tee /etc/netplan/50-wifi.yaml >/dev/null <<'EOF'
network:
  version: 2
  wifis:
    wlp0s20f3:
      dhcp4: true
      access-points:
        "YourSSID":
          password: "YourWifiPassword"
EOF
sudo chmod 600 /etc/netplan/50-wifi.yaml
sudo netplan apply
```

Turn off Wi-Fi power saving, which otherwise adds latency and drops the Tunnel at idle:

```bash
sudo tee /etc/systemd/system/wifi-powersave-off.service >/dev/null <<'EOF'
[Unit]
Description=Disable Wi-Fi power saving for the lab worker
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'for d in /sys/class/net/wl*; do /usr/sbin/iw dev "$(basename "$d")" set power_save off; done'
[Install]
WantedBy=multi-user.target
EOF
sudo apt install -y iw
sudo systemctl enable --now wifi-powersave-off.service
```

Give the laptop a **DHCP reservation** on your router (its Wi-Fi MAC → a fixed address)
so `ssh jacob@192.168.1.42` keeps working; nothing else depends on the address, the
Tunnel dials out.

From the Mac, install your key if you did not import it:

```bash
ssh-copy-id jacob@192.168.1.42
```

## 4. Make it an always-on box (D-006)

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/; s/^#\?HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/; s/^#\?HandleLidSwitchDocked=.*/HandleLidSwitchDocked=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind
```

Close the lid; it stays up. Keep it plugged in; the battery is the UPS. Put it somewhere
the fan can breathe.

## 5. Disk quotas for labs (optional, recommended)

The xfs partition from step 2 needs project quotas for `--storage-opt size` to work:

```bash
sudo sed -i 's#\(/var/lib/docker.*xfs\s*\)defaults#\1defaults,prjquota#' /etc/fstab
grep docker /etc/fstab            # expect ...xfs defaults,prjquota 0 2
sudo umount /var/lib/docker && sudo mount /var/lib/docker
mount | grep docker               # expect prjquota in the options
```

The agent detects this at start and enables per-lab quotas; without it the provider
uses the tmpfs at `/tmp` plus the hard TTL (Stage 02 closing notes).

## 6. Cloudflare and the provisioning script

Follow [lab-host.md](lab-host.md) sections "One-time Cloudflare setup" and "Provision the
host" exactly as written: the Tunnel token, the worker's Access application, the two
service tokens, then on the laptop:

```bash
sudo apt install -y git
export HIVEMIND_GIT_URL=git@github.com:<owner>/HiveMind.git    # or https://…
export HIVEMIND_WORKER_ACCESS_AUD=…
export HIVEMIND_ACCESS_CLIENT_ID=…
export HIVEMIND_ACCESS_CLIENT_SECRET=…
export HIVEMIND_TUNNEL_TOKEN=…
sudo -E bash -c 'git clone "$HIVEMIND_GIT_URL" /opt/hivemind && /opt/hivemind/tools/host/provision.sh'
```

Wi-Fi is fine for everything the script and the labs do: Docker bridges NAT through
`wlp…` like any uplink, labs never get egress anyway, and containerlab links are veth
pairs inside the host. The one Wi-Fi-specific line is the power-saving unit from step 3.

## 7. Verify

```bash
sudo /opt/hivemind/tools/host/provision.sh --check      # on the laptop
journalctl -u hivemind-worker -n 20 --no-pager            # heartbeats every 15 s
```

From the Mac:

```bash
hivemind lab up linux.single --seed 1        # ready in a few seconds, drops into a shell
hivemind lab up bgp.dual_spine --seed 7      # four FRR routers
hivemind lab down --all
```

The Infrastructure console shows `lab-worker-1` online with cpu/mem and runtime versions.

## What to expect over time

- Idle draw is roughly 10 to 20 W; the BGP labs add a few watts.
- When the laptop is off or your ISP drops, labs are unavailable; sessions in flight fail
  with `worker_lost_session` on the next reconcile and nothing is lost.
- Ubuntu's unattended upgrades keep the kernel patched; reboot when `/var/run/reboot-required`
  appears (`sudo reboot`; the unit and cloudflared come back on their own).
- To move to a rented box later, run the rebuild drill in lab-host.md; the laptop can be
  wiped again the same day.
