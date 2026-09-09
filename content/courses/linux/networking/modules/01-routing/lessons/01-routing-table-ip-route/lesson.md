## Why the routing table decides everything {#motivation}

Every packet a Linux host sends starts with one question: _which interface, and which
next hop?_ The answer comes from the routing table, and it is consulted for every single
packet: your SSH keystrokes, a DNS query, a BGP session's TCP segments. When the table is
wrong, applications do not report "wrong route"; they report timeouts, `Network is
unreachable`, or the maddening case where you can reach a host but it cannot reach you.

Operators meet this table on day one. Adding a static route and fixing a broken default
route are part of the RHCSA objectives:claim[not-persistent], and every routing protocol you
will learn later, BGP included, ends its work by writing entries into this same table. If
you can read it and predict its decisions, most "the network is down" tickets shrink to a
two-minute check.

:::callout{kind=note title="Scope"}
IPv4, one host, the `main` table. Policy routing (`ip rule`), IPv6, and multiple tables
follow later in this course; nothing here changes when they arrive.
:::

## A list of prefixes, searched for the longest match {#mental_model}

Think of the table as a list of _prefixes_, each with instructions: send matching packets
out of **this interface**, optionally handing them to **this gateway**. A prefix such as
`10.1.0.0/16` covers every address whose first 16 bits are `10.1`. The special prefix
`0.0.0.0/0`, written `default`, covers every address:claim[default-prefix].

For a destination, the kernel finds _all_ prefixes that contain it and picks the one with
the **longest prefix length**, the most specific one:claim[lpm]. Order in the listing does
not matter; the moment the route was added does not matter. Only when two routes have the
same prefix length does a second key decide: the **metric**, where lower wins:claim[metric].

Two more ideas complete the model:

- **Connected routes.** Giving an interface an address such as `10.0.0.10/24` makes the
  kernel add the route `10.0.0.0/24 dev eth0` by itself:claim[connected]. That route says
  "these hosts are on my own segment; deliver directly, no gateway".
- **Gateways must be on-link.** A route that says `via 10.0.0.2` only works if `10.0.0.2`
  is itself covered by a connected route on that interface:claim[gateway-onlink]. The
  gateway is the first hop; the host must be able to hand the packet over directly.

## Reading, querying, and changing the table {#explanation}

### Reading it

`ip route show` (or just `ip route`) prints the `main` table, one route per line:

```console
$ ip route show
default via 10.0.0.1 dev eth0 proto static metric 100
10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.10
10.1.0.0/16 via 10.0.0.2 dev eth0 proto static metric 100
```

| field                    | meaning                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `default`, `10.0.0.0/24` | the prefix; `default` is `0.0.0.0/0`                                                                            |
| `via 10.0.0.1`           | next hop; absent on connected routes, where delivery is direct                                                  |
| `dev eth0`               | output interface                                                                                                |
| `proto`                  | who installed it: `kernel` (with an address), `static` (an operator), `boot`, or a routing daemon such as `bgp` |
| `scope link`             | the destination is directly reachable on the segment                                                            |
| `src 10.0.0.10`          | source address the kernel prefers for locally generated packets on this route                                   |
| `metric 100`             | preference among routes of equal prefix length; lower wins                                                      |

::question{id=check-default}

### Querying it

Do not guess which line wins; ask the kernel. `ip route get` performs the real lookup for
one destination and prints the decision, including the interface and the source address
that would be used:claim[get]:

```console
$ ip route get 10.1.2.3
10.1.2.3 via 10.0.0.2 dev eth0 src 10.0.0.10 uid 0
    cache
$ ip route get 10.0.0.42
10.0.0.42 dev eth0 src 10.0.0.10 uid 0
    cache
```

The second answer has no `via`: the destination is on the connected `/24`, so the packet is
delivered directly.

::question{id=check-get}

### Changing it

```console
$ ip route add 10.2.0.0/16 via 10.0.0.3            # static route through a gateway
$ ip route add 10.3.0.0/24 dev eth1                # on-link route, no gateway
$ ip route replace default via 10.0.0.254          # replace (or add) the default route
$ ip route del 10.2.0.0/16                         # remove exactly this route
$ ip route add blackhole 192.0.2.0/24              # silently discard
$ ip route add unreachable 198.51.100.0/24         # discard and answer ICMP unreachable
```

`replace` is the safe way to change a default route: it swaps atomically instead of
leaving a moment with no default at all. `blackhole`, `unreachable`, and `prohibit` install
routes that discard matching traffic rather than forward it:claim[route-types].

Changes made with `ip route` take effect immediately and are lost at reboot unless a
configuration system (NetworkManager, systemd-networkd, netplan) recreates
them:claim[not-persistent]. In this course you practice on disposable lab hosts, so
non-persistence is a feature; on a real server, put the route in the network configuration
as well.

### Two switches that change the rules

The table decides where packets _go_, but two kernel settings decide whether some packets
are handled at all. `net.ipv4.ip_forward` must be `1` before a host forwards packets on
behalf of others; without it, a host with a perfect table is still not a
router:claim[forwarding]. And with reverse-path filtering in strict mode
(`net.ipv4.conf.<if>.rp_filter = 1`), the kernel drops incoming packets whose _source_
address would not be routed back out through the interface they arrived
on:claim[rp-filter]. Keep both in mind when a route looks right and packets still vanish.

## The decision, drawn {#diagram}

```ascii
                 host 10.0.0.10/24 (eth0)
                          |
   ---------------- 10.0.0.0/24 segment --------------------
        |                    |                    |
   10.0.0.1 (default)   10.0.0.2 (to 10.1/16)   10.0.0.3 (to 10.1.2/24)
        |                    |                    |
     internet           10.1.0.0/16           10.1.2.0/24

 destination   matching prefixes               longest   next hop
 10.1.2.3      /0  /16  /24                    /24       10.0.0.3
 10.1.7.7      /0  /16                         /16       10.0.0.2
 10.0.0.42     /0  /24 (connected)             /24       direct, no gateway
 8.8.8.8       /0                              /0        10.0.0.1
```

## Following four packets through one table {#worked_example}

Take this table on the host from the diagram:

```console
$ ip route show
default via 10.0.0.1 dev eth0 proto static metric 100
10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.10
10.1.0.0/16 via 10.0.0.2 dev eth0 proto static metric 100
10.1.2.0/24 via 10.0.0.3 dev eth0 proto static metric 100
```

1. **`10.1.2.3`** is contained by `/0`, `/16`, and `/24`. The `/24` is longest, so the
   packet goes to `10.0.0.3`. The kernel first checks that `10.0.0.3` is reachable
   directly: it is, through the connected `10.0.0.0/24`.
2. **`10.1.7.7`** is contained by `/0` and `/16` only. Next hop `10.0.0.2`.
3. **`10.0.0.42`** is on the connected `/24`. No gateway; the packet is delivered directly
   with source `10.0.0.10`.
4. **`8.8.8.8`** matches nothing but `default`. Next hop `10.0.0.1`.

Confirm each with the kernel rather than with your eyes:

```console
$ ip route get 10.1.2.3
10.1.2.3 via 10.0.0.3 dev eth0 src 10.0.0.10 uid 0
    cache
$ ip route get 10.1.7.7
10.1.7.7 via 10.0.0.2 dev eth0 src 10.0.0.10 uid 0
    cache
$ ip route get 8.8.8.8
8.8.8.8 via 10.0.0.1 dev eth0 src 10.0.0.10 uid 0
    cache
```

Now delete the `/24` route and ask again:

```console
$ ip route del 10.1.2.0/24
$ ip route get 10.1.2.3
10.1.2.3 via 10.0.0.2 dev eth0 src 10.0.0.10 uid 0
    cache
```

The destination did not change; the _most specific surviving prefix_ did, so the next hop
moved from `10.0.0.3` to `10.0.0.2`.

## What people get wrong {#misconception}

:::callout{kind=misconception title="The first matching line wins"}
No. `ip route show` prints routes sorted by prefix, and people read it top to bottom as if
it were a firewall rule set. The lookup is by longest prefix:claim[lpm]; a `/24` near the
bottom beats a `default` at the top every time.
:::

:::callout{kind=misconception title="A default route makes any gateway usable"}
No. `via` names a first hop that must already be reachable directly, through a connected
route on that interface:claim[gateway-onlink]. `ip route add default via 172.16.0.1` on a host
whose only address is `10.0.0.10/24` fails with `Nexthop has invalid gateway`. The fix is
not to force the route; it is to notice that the host is on the wrong segment or the
gateway address is wrong.
:::

:::callout{kind=misconception title="If my route is right, replies will come back"}
No. Routing is decided independently at every hop, in each direction. Your route to
`10.1.2.3` says nothing about `10.1.2.3`'s route back to you. When `ping` shows packets sent
and none received, and your table is correct, the missing route is on the remote host or a
router on the return path. `tcpdump` on the far side settles it: if the request arrives and
no reply leaves, look at the far side's table; if a reply leaves and never arrives, look at
the routers in between. Strict reverse-path filtering adds a twist: a return packet can be
dropped by the receiving host because its _source_ would not route back the way it
came:claim[rp-filter].
:::

## Predict before you type {#prediction}

::question{id=predict-lpm}

::question{id=predict-gateway}

## Guided exercise: add, verify, and remove a static route {#guided_exercise}

:::exercise{kind=guided title="Add and verify a static route"}
On a lab host with `10.0.0.10/24` on `eth0` and a default route via `10.0.0.1` (the lab
`Add and verify a static route` in the Lab tab provides exactly this), work through the
steps and check every prediction with `ip route get`.

1. Record the starting point: `ip route show` and `ip route get 10.1.2.3`. The destination
   should fall through to the default route.
2. Add a route through a gateway on your segment: `ip route add 10.1.0.0/16 via 10.0.0.2`.
   Ask again: `ip route get 10.1.2.3` now names `10.0.0.2`.
3. Add a more specific route: `ip route add 10.1.2.0/24 via 10.0.0.3`. Ask a third time;
   the next hop moves to `10.0.0.3` although the `/16` is still present.
4. Try a gateway that is not on your segment: `ip route add 10.4.0.0/16 via 172.16.0.1`.
   Read the error, then explain it in one sentence using the word "connected".
5. Replace the default route atomically: `ip route replace default via 10.0.0.254`, then
   `ip route get 8.8.8.8`. Put it back with `ip route replace default via 10.0.0.1`.
6. Clean up: delete the two static routes and confirm with `ip route show` that only the
   default and the connected route remain.

Write down, for each step, which prefix matched and why. That sentence is the skill.
:::

## A real session, mistakes included {#demonstration}

The transcript below is from a disposable container; the mistakes are left in because
they are the ones you will make.

```console
$ ip -br address show eth0
eth0             UP             10.0.0.10/24
$ ip route show
default via 10.0.0.1 dev eth0
10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.10
$ ip route add 10.1.0.0/16 via 10.0.0.2
$ ip route get 10.1.2.3
10.1.2.3 via 10.0.0.2 dev eth0 src 10.0.0.10 uid 0
    cache
$ ip route add 10.4.0.0/16 via 172.16.0.1
Error: Nexthop has invalid gateway.
$ ip route get 172.16.0.1
172.16.0.1 via 10.0.0.1 dev eth0 src 10.0.0.10 uid 0
    cache
```

The gateway `172.16.0.1` is reachable only _through_ the default route, not directly, so it
cannot serve as a first hop. Two ways forward exist: use a gateway on the segment, or, if
`172.16.0.1` really is a neighbour on the wire despite the addressing, add an explicit
on-link route to it first (`ip route add 172.16.0.1/32 dev eth0`) and then the route via it.
The second form is a deliberate statement that the addressing is unusual; use it only when
you know why.

```console
$ ip route add 172.16.0.1/32 dev eth0
$ ip route add 10.4.0.0/16 via 172.16.0.1
$ ip route show
default via 10.0.0.1 dev eth0
10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.10
10.1.0.0/16 via 10.0.0.2 dev eth0
10.4.0.0/16 via 172.16.0.1 dev eth0
172.16.0.1 dev eth0 scope link
```

## Independent problem: a subnet you cannot reach {#independent_problem}

:::exercise{kind=independent title="A subnet the host cannot reach"}
The practice lab `A subnet the host cannot reach` gives you a host that can reach its
default gateway and the internet but not the servers in `10.1.2.0/24`, which sit behind a
router on the host's own segment. Restore reachability to `10.1.2.0/24` **without changing
the default route**, and prove it with `ip route get` before and after. Hints are available
in the lab and cap the mastery credit for the attempt; the grader checks reachability and
that the default route is unchanged.
:::

## Reflection {#reflection}

::question{id=reflect-asymmetric}

Then answer for yourself: which single command would you run first on any host that "cannot
reach" something, and what would each possible output tell you?

## Mastery evaluation {#mastery_evaluation}

Two checks below; both count as evidence for `linux.networking.routing_table`, and the
graded practice lab above counts more, because it is executable proof rather than recall.

::question{id=mastery-metric}

::question{id=mastery-diagnose}
