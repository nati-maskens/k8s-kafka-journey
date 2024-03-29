# K8S And Kafka Journey

## Local K8S using `kubeadm`, VirtualBox and `containerd`

### Installation, Cluster setup

#### Installation Dependecies

1. Need to install `kubelet` (the main service), `kubeadm` (the init tool) and `kubectl` (the management tool).
1. Need to install `containerd`. Docker is deprecated with K8s version v1.24+.
1. I think you need to install [`cni-plugins`](https://github.com/containernetworking/plugins), Arch Linux link: [`cni-plugins`](https://archlinux.org/packages/community/x86_64/cni-plugins).  
Maybe flannel is doing it alone on deployment into the cluster, I'm not sure.
1. I did **not** need to have local `etcd`. Its getting deployed within cluster.

#### Pre Init setup
1. Install and setup VirtualBox, see below **"VirtualBox Setup"** section, for networking. The following steps has to be done on both VM for control plane and any other local node:
1. Swap has to be off. K8s and Swap are NOT working together.
1. `containerd` is coming not fully configured to work with `systemd`. Steps to do:
   * Make the default config a file, located at the default place for the config:
      ```bash
      $ mkdir /etc/containerd
      $ containerd config default > /etc/containerd/config.toml
      ```
      (You'll may have to run `containerd` once in order that the above command will work)
   * Now edit the file, at the section (which **has** to be there) called:  
      `[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]`
      Change `SystemdCgroup` to `true` and save the file.
   * Restart `containerd` service.
1. Start and enable `kubelet` service. If k8s was already initialized this is how you run it.  
   If it was not initialized, `kubelet` will fail until there will be configurations in place, and that's ok.

#### Init cluster (with the control plane)

1. You need a clean state before initialization. Google for `kubeadm reset`.
1. Init cluster with **`kubeadm`**:
   ```bash
   $ kubeadm init --pod-network-cidr='10.85.0.0/16' --apiserver-advertise-address=192.168.56.10 --cri-socket=unix:///run/containerd/containerd.sock
   # --apiserver-advertise-address is The static ip of the vm in the host vboxnet0 adapter.
   # The CIDR is for inner use of the k8s inner network. Can be anything that doesn't collide.
   # Take note of the CIDR. It'll be used later.
   # --cri-socket is the containerd networking socket
   ```
1. You first need to assign (connect) the `kubectl` management tool to the local k8s, so do as the `kubeadm` output says
   and copy the cluster and context and user data to the VM's **and** the **local** `~/.kube/config` so that `kubectl` will work on the VM cluster.
1. Check `current-context` at the `~/.kube/config` file, in case you have many contexts.
1. Now you have to deploy the
   [pod network add on](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/#pod-network)  
   It was long journey doing that with [**flannel**](https://github.com/flannel-io/flannel) so
   please refer to the "**Flannel Pod network plugin**" section and do as said there now.
1. Now cluster have to work. Check:  
   ```bash
   $ kubectl get pods --all-namespaces
   ```
   Everything has to run. If some pod about DNS in `pending` so there is a problem with network or something.
   ```bash
   $ journalctl -f -u kubelet
   ```

### [Flannel](https://github.com/flannel-io/flannel) Pod network plugin
The network plugin is run as a special pod within the Cluster beause it makes use of many parts that are already there
e.g. `etcd`, etc.

The usual command into the cluster using command looks like:  
```bash
$ kubectl apply -f <add-on.yaml>
```
The command is [here, see `kubectl apply ...` command](https://github.com/flannel-io/flannel#deploying-flannel-manually) **but** do
not run it yet.  
You need to edit that `kube-flannel.yml` file before, so download it and change the following:
1. **Match the pod-cidr**  
   In the section of the kind: `ConfigMap` the is `data`.`net-conf.json`. within that json the `"Network"` CIDR is hardcoded.
   Change it that it will match the `--pod-network-cidr` from the `kubeadm init` command.
1. **Use the VM's static network interfaces**  
   The flannel have to use the virtualbox inner static "Host Only" network, so that the VM and nodes outside could talk.  
   Also note that the `flanneld` service will get created at the control-plane and then copied to every joining node (since it's a [DaemonSet](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)),
   so one value (for example, the interface name within the VM) won't be enough because it won't match the outside (host?) node interface,
   so we need to use multiple values.  
   Add those inteface names to the section of the kind: `DaemonSet` at `spec`.`template`.`spec`.`containers` to the container named `kube-flannel`
   at the `args` field (wow!). Add something like:
   ```yaml
   - --iface=enp0s8
   - --iface=vboxnet0
   ```
   Which are the network interface names for the same bounded "Host Only" network, from within and outside of the VM.

**Why** are those things not carefully documented?!! Do you want us to use your software Flannel guys, or just to spit blood? By the beard of Achashverosh it took me five hours to find out the whole thing.

Now please apply the Flannel network plugin `kubectl apply` using the updated `kube-flannel.yml` file. Example of it are put here for reference.  

#### Notes
- Flannel is using a pod within the cluster. Maybe to troubleshoot you need to kill it and let k8s bringing it up again, see [here](https://wiki.archlinux.org/title/Kubernetes#Troubleshooting).
- Flannel will create a new ip interface called `flannel.1` which can be teared down with:  
  ```
  $ sudo ip link delete flannel.1
  ```
  I'm not sure if it will remove the corresponding ip tables routes though...
- sometimes you have to clean up the `flannel.1` and the `cni0` network interfaces and restart kubelet to let the flanned pods create those again.
  Do it if you encounter errors like "cni already have address bla bla"

## VirtualBox Setup
### Networking
2 Adapters:
1. The usual NAT, to let the VM connect to outside world.
2. The "Host Only" to give the VM static connection with host without port forwarding.
```
VBoxManage list vms
```
To start that VM headless:
```
VBoxHeadless -s <vm>
```
### Post setup, and other nodes:
No pods will run on the master/control-plane node by default.  
Remove the taint:
``` bash
$ kubectl taint nodes k8s-control-plane-01 node-role.kubernetes.io/master-
```
The minus at the end is "Remove that taint"
### Join Node
- The joined node has to publish it's static VM related network ip, so you need to add 
  `--node-ip=192.168.56.1` (or the correct node static ip at the `vboxnet0` iface) to the `KUBELET_ARGS=` arguments, at the config file: `/etc/kubernetes/kubelet.env`
```
/etc/kubernetes/kubelet.env
```
At the joining node.

## Maintenance
The certificates created by kubeadm for TLS connection will be expired after a year.
There are [many solutions](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/), but they will get **renewed** automatically when **upgrading** the control-place (plus the core pods).

### Upgrade
Upgrading `kubelet`, `kubectl` or `kubeadm` software will **not** upgrade to control plane, api server, and the other pods which makes the cluster.

You need to do upgrade from time to time to don't let the gap between the software and the containers versions grow.

Follow upgrade instructions:  
https://v1-25.docs.kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/

Basically you have to:
```
# kubeadm upgrade plan
```
and then
```
kubeadm upgrade apply v1.2x.x
```
This will also **renew** the TLS certificates (as said above) so if you do it once a year you will save yourself the connection failure after these will expire.

## Useful resources:
- [`kubeadm` cluster create](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm)
- [`kubeadm` ref](https://kubernetes.io/docs/reference/setup-tools/kubeadm)
- [Arch Linux K8S](https://wiki.archlinux.org/title/Kubernetes)
- [Official Tutorials Home](https://kubernetes.io/docs/tutorials/kubernetes-basics/)
- [Good Pods overview](https://kubernetes.io/docs/tutorials/kubernetes-basics/explore/explore-intro)
- [Good Services overview](https://kubernetes.io/docs/tutorials/kubernetes-basics/expose/expose-intro)
- [Intro to scale tutorial](https://kubernetes.io/docs/tutorials/kubernetes-basics/scale/scale-intro)
- [Amazing `kubectl` CheetSheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [SystemD units ref](https://www.freedesktop.org/software/systemd/man/systemd.service.html)

-- By Nati Maskens