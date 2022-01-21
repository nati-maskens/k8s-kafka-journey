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

1. You need some clean space before initialization. See reset.
1. The minimum viable command for initialization worked for me:  
   ```bash
   $ sudo kubeadm init --pod-network-cidr='10.85.0.0/16'
   ```
   I think that this cidr will work because of [`cni-plugins`](https://github.com/containernetworking/plugins). I'm not sure.
1. You first need to assign the management to the local k8s, so do as the `kubeadm` output says and copy the cluster and context and user data to `~/.kube/config` so that `kubectl` will work on the local cluster.
1. Check `current-context` at the `~/.kube/config` file, in case you have many contexts.
1. Now you have to deploy the [pod network add on](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/#pod-network) into the cluster using command
   like:  
   ```bash
   $ kubectl apply -f <add-on.yaml>
   ```
   I'm using [**flannel**](https://github.com/flannel-io/flannel)
   So take the command from [here, see `kubectl apply ...` command](https://github.com/flannel-io/flannel#deploying-flannel-manually)  
   See section about flannel, it's important.
1. Now cluster have to work. Check:  
   ```bash
   $ kubectl get pods --all-namespaces
   ```
   Everything has to run. If some pod about DNS in `pending` so there is a problem with network or something.
   ```bash
   $ journalctl -f -u kubelet
   ```

### Flannel Pod network plugin
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
Of course - This solution **will not hold** because most surely `kubeadm` is creating and changing that file again. TODO: Check it.  
I'm pretty sure that `kubeadm` can get a flag to set that field specifically. So, TODO...

#### Notes
- Flannel is using a pod within the cluster. Maybe to troubleshoot you need to kill it and let k8s bringing it up again, see [here](https://wiki.archlinux.org/title/Kubernetes#Troubleshooting).
- Flannel will create a new ip interface called `flannel.1` which can be teared down with:  
  ```
  $ sudo ip link delete flannel.1
  ```
  I'm not sure if it will remove the corresponding ip tables routes though...

## Going on to VirtualBox:
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
### Kubeadm
The seemingly static succefull one:
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
### Useful resources:
- [`kubeadm` cluster create](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm)
- [`kubeadm` ref](https://kubernetes.io/docs/reference/setup-tools/kubeadm)
- [Arch Linux K8S](https://wiki.archlinux.org/title/Kubernetes)
- [Good Pods overview](https://kubernetes.io/docs/tutorials/kubernetes-basics/explore/explore-intro)
- [Good Services overview](https://kubernetes.io/docs/tutorials/kubernetes-basics/expose/expose-intro)
- [Into to scale tutorial](https://kubernetes.io/docs/tutorials/kubernetes-basics/scale/scale-intro)

-- By Nati Maskens