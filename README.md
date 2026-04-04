# Advanced Analytics

A mod for [Subway Builder](https://www.subwaybuilder.com) that adds detailed per-route analytics, historical tracking, financial metrics, and real-time timetable analysis to your network.

[![Latest Release](https://img.shields.io/github/v/release/stefanorigano/advanced_analytics?label=stable&color=2ea44f)](https://github.com/stefanorigano/advanced_analytics/releases/latest)
[![Pre-release](https://img.shields.io/github/v/release/stefanorigano/advanced_analytics?include_prereleases&label=pre-release&color=e3b341)](https://github.com/stefanorigano/advanced_analytics/releases?q=prerelease%3Atrue)

![2.png](README/2.png)

---

## What it does

Advanced Analytics sits alongside the game UI and gives you data the base game doesn't expose:

- **Per-route metrics** — ridership, throughput, load factor, performance, transfer connections, revenue, cost, profit, and profit per train
- **Timetable analysis** — real-time headway regularity, schedule drift, per-stop delay profile, and dwell compliance charts
- **Three data modes** — live (last 24h), historical (end-of-day snapshots), and side-by-side day comparison
- **Trend charts** — visualize how any route evolved over time
- **Route notes** — attach a free-text note to any route and track it alongside its historical profit
- **System map** — schematic overview of your entire network
- **Storage manager** — export, import, and manage analytics data across saves

All data is stored in IndexedDB and persists across game restarts. No save file is modified.

---

### Metrics explained

#### Financial & capacity

| Metric | What it measures |
|---|---|
| **Ridership** | Total passenger-trips recorded on the route in the last rolling 24 hours. |
| **Throughput** | Total passenger-trips the route *could* carry in 24 hours given its current train schedule and loop time. |
| **Load Factor** | Peak passengers on the busiest segment ÷ train capacity. The primary crowding indicator. Values above 100% mean trains are overcrowded at their peak. |
| **Performance** | Daily ridership ÷ bidirectional 24 h throughput ceiling. Measures how efficiently the route's schedule is being used. A value above 1× means high passenger turnover at intermediate stops — a good sign on busy multi-stop routes. |
| **Revenue** | Total fare income for the day, read directly from the game's revenue model. |
| **Cost** | Daily operational cost based on trains deployed, train type, and hours of service. Accounts for mid-day schedule changes. |
| **Profit** | Revenue minus Cost. |
| **Profit / Train** | Daily profit divided by total trains across all demand tiers. |

#### Timetable analysis

These four metrics appear in the Route panel and update continuously throughout the day as trains complete each stop. They reset at midnight.

| Metric | What it measures |
|---|---|
| **Headway Regularity** | How evenly spaced consecutive trains are at the first stop. Expressed as a coefficient of variation (CV) — the lower, the more regular. High values indicate bunching. |
| **Schedule Drift** | How far ahead or behind the timetable the whole route has shifted, averaged across all trains and stops. Distinct from Headway: trains can be evenly spaced but still all running late. |
| **Delay Profile** | Per-stop chart of average arrival delay accumulated across all laps today. Reveals whether delays are growing progressively or isolated to a single problem station. |
| **Dwell Compliance** | Per-stop chart of actual vs scheduled dwell time. Positive values mean trains are being held longer than planned — a common cause of downstream delays on busy routes. |

---

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
1. Create the `advanced-analytics` folder in your mods directory (Main Menu > Settings > Mods).
2. Download the [latest ZIP from the release page](https://github.com/stefanorigano/advanced_analytics/releases/latest).
3. Extract the ZIP content **into** the `advanced-analytics` folder you created.
4. Restart the game and activate "Advanced Analytics" — that's it 🙂

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
