# K8S And Kafka Journey

## Local K8S using `kubeadm`

### Installation, Cluster setup

#### Installation Dependecies

1. Need to install `kubelet` (the main service), `kubeadm` (the init tool) and `kubectl` (the management tool).
1. I have [`cni-plugins`](https://github.com/containernetworking/plugins) installed. Not sure yet if this is a real dependency.
1. I do **not** need to have local `etcd`. Its getting deployed within cluster.

#### Before Init
1. Swap has to be off.
1. Start `kubelet` service. If k8s was already initialized this is how you run it.  
   If it was not initialized, `kubelet` will fail until there will be configurations in place, and that's ok.

#### Init cluster (with the control plane)

1. I managed to do it only with VM. Please follow first steps at the "**Going on to VirtualBox**" section.
1. You need some clean space before initialization. See reset.
1. Run the init command from the "`kubeadm init` with VM" section, inside the VM.  
   There is a parameter in that command named "`pod-network-cidr`" please remember it.  
   P.S. I think that this cidr will work because of [`cni-plugins`](https://github.com/containernetworking/plugins). I'm not sure.
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
You thought this is the end of the story? nope.

At first it was **not working** for me. `kubelet` outputs something like:
```
failed to find plugin \"flannel\" in path [/usr/lib/cni]
```
And:
```
message:docker: network plugin is not ready: cni config uninitialized
```
I first did this: [Arch linux about bug with flannel and systemd network](https://wiki.archlinux.org/title/Kubernetes#Troubleshooting). (See about flannel).

Then I found that it was also about that `/usr/lib/cni` path.  
There is an environment variable passed to `kubelet` service, which was:
```
KUBELET_ARGS=--cni-bin-dir=/usr/lib/cni
```
The value `--cni-bin-dir=/usr/lib/cni` was appended to the `kubelet` execute command. This was **not good** because after deploying the Flannel it was copying the binary into to **host to a different path:** `/opt/cni/bin`, as we can see [here](https://github.com/flannel-io/flannel/blob/37f29499b49e2e1bc0de6f48ea5562149bb38ae2/Documentation/kube-flannel.yml#L178).  
This env variable is going into the `kubelet` service unit as [`EnvironmentFile`](https://www.freedesktop.org/software/systemd/man/systemd.exec.html#EnvironmentFile=) so doing a [drop in edit to the unit](https://wiki.archlinux.org/title/systemd#Drop-in_files) with the specific `Environment=` was not working because it gets overrided by this file:
```
/etc/kubernetes/kubelet.env
```
#### Temporary solution:
Just to check if it's working, was to change the above file to have:
```
KUBELET_ARGS=--cni-bin-dir=/opt/cni/bin
```
Then restart the service, and it worked.
You can check the real arguments passed to the kubelet using:
```bash
$ systemctl status kubelet
```
Look at the exec command at `CGroup:` section. You can also take the `pid` and do:
```
$ sudo strings /proc/<kubelet-pid>/environ
```
~~Of course - This solution **will not hold** because most surely `kubeadm` is creating and changing that file again. TODO: Check it.  
I'm pretty sure that `kubeadm` can get a flag to set that field specifically. So, TODO...~~  
EDIT: I found that kubeadm is really using this file to make the `kubelet` command, so maybe after all this is a correct solution, who knows...

#### Notes
- Flannel is using a pod within the cluster. Maybe to troubleshoot you need to kill it and let k8s bringing it up again, see [here](https://wiki.archlinux.org/title/Kubernetes#Troubleshooting).
- Flannel will create a new ip interface called `flannel.1` which can be teared down with:  
  ```
  $ sudo ip link delete flannel.1
  ```
  I'm not sure if it will remove the corresponding ip tables routes though...
- sometimes you have to clean up the `flannel.1` and the `cni0` network interfaces and restart kubelet to let the flanned pods create those again.
  Do it if you encounter errors like "cni already have address bla bla"

## Going on to VirtualBox
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
### `kubeadm init` with VM:
The seemingly static succesfull one:
```bash
$ kubeadm init --pod-network-cidr='10.85.0.0/16' --apiserver-advertise-address=192.168.56.10
# --apiserver-advertise-address is The static ip of the vm in the host vboxnet0 adapter.
# The cidr is for inner use of the k8s inner network. an be something that doesn't collide
```

Do the other steps, of course: Connect the kubectl and apply network plugin.
You can now take the admin config from the kubeadm output and use it at the host to connect to the vm cluster.

No pods will run on the master/control-plane node by default.  
Remove the taint:
``` bash
$ kubectl taint nodes k8s-control-plane-01 node-role.kubernetes.io/master-
```
The minus at the end is "Remove that taint"
### Join Node
- The joined node has to publish it's static VM related network ip, so you need to add 
  `--node-ip=192.168.56.1` (or the correct node static ip at the `vboxnet0` iface) to the `KUBELET_ARGS=` arguments.
```
/etc/kubernetes/kubelet.env
```
At the joining node.
### Useful resources:
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