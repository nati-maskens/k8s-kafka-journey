# Old bugs of Flannel & `kubeadm`
Which I think currently solve.

For the protocol:

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
