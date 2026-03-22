# Advanced Analytics

A mod for [Subway Builder](https://www.subwaybuilder.com) that adds detailed per-route analytics, historical tracking, and financial metrics to your network.

[![Latest Release](https://img.shields.io/github/v/release/stefanorigano/advanced_analytics?label=stable&color=2ea44f)](https://github.com/stefanorigano/advanced_analytics/releases/latest)
[![Pre-release](https://img.shields.io/github/v/release/stefanorigano/advanced_analytics?include_prereleases&label=pre-release&color=e3b341)](https://github.com/stefanorigano/advanced_analytics/releases?q=prerelease%3Atrue)

![2.png](README/2.png)

---

## What it does

Advanced Analytics sits alongside the game UI and gives you data the base game doesn't expose:

- **Per-route metrics** — ridership, throughput, load factor, capacity usage, transfer connections, revenue, cost, profit, and profit per train
- **Three data modes** — live (last 24h), historical (end-of-day snapshots), and side-by-side day comparison
- **Trend charts** — visualize how any route evolved over time
- **System map** — schematic overview of your entire network
- **Storage manager** — export, import, and manage analytics data across saves

All data is stored in IndexedDB and persists across game restarts. No save file is modified.

### Metrics explained

| Metric | What it measures |
|---|---|
| **Load Factor** | Peak passengers on the busiest segment ÷ train capacity. The primary crowding indicator. Values above 100% mean trains are overcrowded at their peak. For back-and-forth (pendulum) routes, the combined load is halved to get a per-direction figure; for circular (one-way loop) routes the load is already directional. Shows `—` until commute data is available. |
| **Usage (cap.)** | Daily ridership ÷ 24 h throughput ceiling. A throughput efficiency measure — how much of the route's scheduling capacity is being filled each day. Different from Load Factor: a route can have low Load Factor (trains never packed) but moderate Usage (many trips made). |
| **Throughput** | Total passenger-trips the route *could* carry in 24 hours given its current train schedule and loop time. |
| **Ridership** | Total passenger-trips recorded on the route in the last rolling 24 hours. |

[![Liberapay](https://img.shields.io/badge/Liberapay-Support-F6C915?logo=liberapay&logoColor=black)](https://liberapay.com/Steno)
<a href='https://ko-fi.com/Q5Q61VIM68' target='_blank'><img height='20' style='border:0px;height:40px;' src='https://storage.ko-fi.com/cdn/kofi3.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

![3.png](README/3.png)

---

## Installation
There are two installation methods.

### 🚇 _Railyard_ mod manager (suggested)
Install [_Railyard_](https://subwaybuildermodded.com/railyard/) mod manager.
Search for "Advanced Analytics".

### 🛠️ Manual (Github)
1. Crate the `advanced-analytics` folder in into your mods directory ( Main Menu > Settings > Mods)
2. Download the [latest ZIP from the release page]( https://github.com/stefanorigano/advanced_analytics/releases/latest).
3. Extract the ZIP content **into** the advanced-analytics folder you created.
4. Restart the game and activate the "Advanced Analytics" - That's it 🙂

---

#### Manual Download Links

[![Latest Release](https://img.shields.io/github/v/release/stefanorigano/advanced_analytics?label=stable&color=2ea44f)](https://github.com/stefanorigano/advanced_analytics/releases/latest)
[![Pre-release](https://img.shields.io/github/v/release/stefanorigano/advanced_analytics?include_prereleases&label=pre-release&color=e3b341)](https://github.com/stefanorigano/advanced_analytics/releases?q=prerelease%3Atrue)

_Pre-releases may contain incomplete features or bugs. Use stable builds for everyday play._

---

   ![top.png](README/top.png)

---

## Contributing

Bug reports and feature suggestions are welcome.

- **Found a bug?** [Open an issue](https://github.com/stefanorigano/advanced_analytics/issues/new) with steps to reproduce and your game version.
- **Have an idea?** Open an issue to discuss it before sending a PR.
- **Want to contribute code?** Fork the repo, make your changes on a branch, and open a pull request against `master`. Please keep PRs focused — one feature or fix per PR.

### Useful Links

|                             |                                                               |
|-----------------------------|---------------------------------------------------------------|
| 🚇 Subway Builder           | [subwaybuilder.com](https://www.subwaybuilder.com)            |
| 📖 Official API docs        | [subwaybuilder.com/docs](https://www.subwaybuilder.com/docs/) |
| 💬 Community Modding  | _[subwaybuildermodded.com](https://subwaybuildermodded.com/)_ |


---

## Thank you

A big thank you to everyone who tested early builds, reported bugs, and shared feedback. This mod wouldn't be where it is without your support. ❤️

---

## License

[![License](https://img.shields.io/github/license/stefanorigano/advanced_analytics)](LICENSE)