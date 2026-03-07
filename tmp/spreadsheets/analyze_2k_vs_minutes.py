from __future__ import annotations

import math
import re
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.ticker import FuncFormatter

REPO_ROOT = Path("/Users/giacomo/dev/rowbook")
XLSX_PATH = Path("/Users/giacomo/Downloads/3-4-26 2k Test.xlsx")
MINUTES_CSV = REPO_ROOT / "tmp/spreadsheets/minutes_feb1_mar1_all_athletes.csv"
OUT_DIR = REPO_ROOT / "output/spreadsheet"
OUT_DIR.mkdir(parents=True, exist_ok=True)

OUT_DATA_CSV = OUT_DIR / "2k_vs_minutes_feb1_mar1_2026.csv"
OUT_PLOT = OUT_DIR / "2k_vs_minutes_feb1_mar1_2026.png"
OUT_SUMMARY = OUT_DIR / "2k_vs_minutes_feb1_mar1_2026_summary.txt"

ALIAS_MAP = {
    "tim laux": "timothy laux",
    "kai antoniades": "constantinos antoniades",
    "eric liesner": "eric liesener",
    "matt fulgieri": "matthew fulgieri",
    "sam speed": "samuel speed",
}


def canonical_name(name: str) -> str:
    s = str(name).strip().lower()
    s = s.replace(".", "").replace("'", "")

    if "," in s:
        last, first = [p.strip() for p in s.split(",", 1)]
        s = f"{first} {last}"

    s = " ".join(s.split())
    return ALIAS_MAP.get(s, s)


def token_key(name: str) -> str:
    tokens = re.findall(r"[a-z]+", canonical_name(name))
    return " ".join(sorted(tokens))


def parse_total_time_seconds(value) -> float:
    if pd.isna(value):
        return math.nan

    if hasattr(value, "hour") and hasattr(value, "minute") and hasattr(value, "second"):
        micro = getattr(value, "microsecond", 0)
        return float(value.hour * 3600 + value.minute * 60 + value.second + micro / 1_000_000)

    s = str(value).strip()
    if not s or s == "=":
        return math.nan

    try:
        td = pd.to_timedelta(s)
        return float(td.total_seconds())
    except Exception:
        pass

    parts = s.split(":")
    if len(parts) == 3:
        h, m, sec = parts
        try:
            return float(h) * 3600 + float(m) * 60 + float(sec)
        except ValueError:
            return math.nan

    return math.nan


def format_seconds_tick(seconds: float, _position: int) -> str:
    minutes = int(seconds // 60)
    secs = seconds - minutes * 60
    return f"{minutes}:{secs:04.1f}"


def main() -> None:
    df_2k = pd.read_excel(XLSX_PATH, header=1)
    df_2k = df_2k[["Name", "Total Time"]].copy()
    df_2k = df_2k.dropna(subset=["Name"])
    df_2k["Name"] = df_2k["Name"].astype(str).str.strip()
    df_2k["time_seconds"] = df_2k["Total Time"].apply(parse_total_time_seconds)
    def format_mmss(seconds: float) -> str:
        if pd.isna(seconds):
            return ""
        minutes = int(seconds // 60)
        secs = seconds - minutes * 60
        return f"{minutes:02d}:{secs:05.2f}"

    df_2k["time_mmss"] = df_2k["time_seconds"].apply(format_mmss)
    df_2k["name_key"] = df_2k["Name"].apply(token_key)

    df_minutes = pd.read_csv(MINUTES_CSV)
    df_minutes = df_minutes.dropna(subset=["name"]).copy()
    df_minutes["name"] = df_minutes["name"].astype(str).str.strip()
    df_minutes["name_key"] = df_minutes["name"].apply(token_key)

    merged = df_2k.merge(df_minutes, on="name_key", how="left", validate="m:1")

    merged = merged.rename(
        columns={
            "Name": "name_2k_sheet",
            "name": "matched_athlete_name",
            "total_minutes": "total_minutes_feb1_mar1",
        }
    )

    merged["matched_athlete_name"] = merged["matched_athlete_name"].fillna("")
    merged["total_minutes_feb1_mar1"] = merged["total_minutes_feb1_mar1"].fillna(0).astype(int)

    # Regression data: only athletes with a valid 2k time and a matched athlete record.
    reg = merged[(~merged["time_seconds"].isna()) & (merged["matched_athlete_name"] != "")].copy()

    x = reg["total_minutes_feb1_mar1"].astype(float).to_numpy()
    y = reg["time_seconds"].astype(float).to_numpy()

    slope, intercept = np.polyfit(x, y, 1)
    corr = float(np.corrcoef(x, y)[0, 1])
    r_squared = float(corr**2)
    sec_per_100 = slope * 100

    # Plot (athlete-friendly): cleaner styling + trend band + bin averages.
    fig, ax = plt.subplots(figsize=(11, 6.8))
    fig.patch.set_facecolor("#f3f4ef")
    ax.set_facecolor("#fcfdfb")

    ax.scatter(
        x,
        y,
        s=70,
        alpha=0.85,
        color="#2a9d8f",
        edgecolor="white",
        linewidth=0.9,
        label="Athletes",
        zorder=3,
    )

    x_fit = np.linspace(x.min(), x.max(), 220)
    y_fit = slope * x_fit + intercept
    ax.plot(x_fit, y_fit, color="#264653", linewidth=2.6, label="Linear trend", zorder=4)

    # Bootstrap confidence envelope for a more visible trend shape.
    rng = np.random.default_rng(42)
    boot_predictions = np.empty((700, len(x_fit)))
    n = len(x)
    for i in range(700):
        sample_idx = rng.integers(0, n, n)
        sample_x = x[sample_idx]
        sample_y = y[sample_idx]
        bslope, bintercept = np.polyfit(sample_x, sample_y, 1)
        boot_predictions[i] = bslope * x_fit + bintercept
    lower, upper = np.percentile(boot_predictions, [10, 90], axis=0)
    ax.fill_between(x_fit, lower, upper, color="#264653", alpha=0.17, linewidth=0, zorder=2)

    reg["minute_bin"] = pd.qcut(reg["total_minutes_feb1_mar1"], q=5, duplicates="drop")
    bin_stats = (
        reg.groupby("minute_bin", observed=True)
        .agg(
            minutes_center=("total_minutes_feb1_mar1", "mean"),
            mean_time=("time_seconds", "mean"),
        )
        .sort_values("minutes_center")
    )
    ax.plot(
        bin_stats["minutes_center"],
        bin_stats["mean_time"],
        color="#e76f51",
        marker="o",
        linewidth=2.2,
        markersize=7,
        label="5-bin average",
        zorder=5,
    )

    ax.set_title("More Training Minutes, Faster 2k Times", fontsize=18, weight="bold", pad=14)
    fig.text(
        0.125,
        0.92,
        "Feb 1 to Mar 1, 2026. Up is faster (lower time).",
        fontsize=11,
        color="#3f4a4f",
    )
    ax.set_xlabel("Total Training Minutes in Period", fontsize=12)
    ax.set_ylabel("2k Time (mm:ss)", fontsize=12)
    ax.yaxis.set_major_formatter(FuncFormatter(format_seconds_tick))
    ax.invert_yaxis()
    ax.grid(alpha=0.22, color="#7c8a8f")
    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)

    model_delta = slope * (x.max() - x.min())
    stats = (
        f"r = {corr:.3f}  |  R² = {r_squared:.3f}  |  n = {len(reg)}\n"
        f"~{abs(sec_per_100):.2f}s {'faster' if sec_per_100 < 0 else 'slower'} per +100 minutes\n"
        f"Estimated difference across range: {abs(model_delta):.1f}s"
    )
    ax.text(
        0.015,
        0.03,
        stats,
        transform=ax.transAxes,
        ha="left",
        va="bottom",
        fontsize=10,
        color="#1f2933",
        bbox={"boxstyle": "round,pad=0.35", "facecolor": "#f0f5f2", "edgecolor": "#ced8d0"},
    )
    ax.legend(loc="upper right", frameon=False)

    plt.tight_layout(rect=[0, 0, 1, 0.9])
    plt.savefig(OUT_PLOT, dpi=220)
    plt.close(fig)

    merged = merged[
        [
            "name_2k_sheet",
            "matched_athlete_name",
            "total_minutes_feb1_mar1",
            "Total Time",
            "time_seconds",
            "time_mmss",
        ]
    ].sort_values(["time_seconds", "name_2k_sheet"], na_position="last")

    merged.to_csv(OUT_DATA_CSV, index=False)

    unmatched = merged[merged["matched_athlete_name"] == ""]["name_2k_sheet"].tolist()
    missing_time = merged[merged["time_seconds"].isna()]["name_2k_sheet"].tolist()

    summary_lines = [
        "2k vs Minutes Regression (Feb 1 to Mar 1, 2026)",
        f"Input rows from 2k sheet: {len(df_2k)}",
        f"Rows with athlete match: {(merged['matched_athlete_name'] != '').sum()}",
        f"Rows used in regression (valid 2k time + match): {len(reg)}",
        f"Pearson correlation (r): {corr:.6f}",
        f"R-squared: {r_squared:.6f}",
        f"Slope (seconds per minute): {slope:.6f}",
        f"Slope (seconds per +100 minutes): {sec_per_100:.6f}",
        f"Intercept (seconds): {intercept:.6f}",
        "",
        "Unmatched 2k names:",
        *(unmatched if unmatched else ["(none)"]),
        "",
        "2k names with missing/invalid Total Time:",
        *(missing_time if missing_time else ["(none)"]),
        "",
        "Manual alias mappings applied:",
        *(f"{k} -> {v}" for k, v in ALIAS_MAP.items()),
    ]

    OUT_SUMMARY.write_text("\n".join(summary_lines))

    print(f"Wrote: {OUT_DATA_CSV}")
    print(f"Wrote: {OUT_PLOT}")
    print(f"Wrote: {OUT_SUMMARY}")
    print(stats)


if __name__ == "__main__":
    main()
