"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, ModalContent } from "@heroui/react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { Pause, Play, Trophy } from "lucide-react";
import { ACTIVITY_TYPE_LABELS } from "@rowbook/shared";

import { ActivityIcon } from "@/components/ui/activity-icon";
import { Button } from "@/components/ui/button";
import { formatWeekRange } from "@/lib/format";
import type { WeeklyReveal, WeeklyRevealAthlete } from "@/lib/weekly-reveal";
import styles from "./weekly-reveal.module.css";

type Scene = { id: string; duration: number; athlete?: WeeklyRevealAthlete };

function Count({ value, reduced }: { value: number; reduced: boolean }) {
  const count = useMotionValue(reduced ? value : 0);
  const rounded = useTransform(count, (number) => Math.round(number).toLocaleString("en-US"));
  useEffect(() => {
    const controls = animate(count, value, { duration: reduced ? 0 : 1.1, ease: "easeOut" });
    return () => controls.stop();
  }, [count, reduced, value]);
  return <><span className="sr-only">{value.toLocaleString("en-US")}</span><motion.span aria-hidden>{rounded}</motion.span></>;
}

function AthleteStats({ athlete }: { athlete: WeeklyRevealAthlete }) {
  const change = athlete.percentChange;
  return (
    <div className={styles.athleteStats}>
      <div className={styles.metrics}>
        <div><strong>{athlete.avgHr === null ? "No HR data" : `${Math.round(athlete.avgHr)} bpm`}</strong><span>Average heart rate</span></div>
        <div><strong>{change === null ? "New this week" : `${change > 0 ? "+" : ""}${change.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`}</strong><span>{change === null ? "0 minutes the week before" : "Minutes vs. previous week"}</span></div>
      </div>
      <div className={styles.badges} aria-label="Workout activities">
        {athlete.activityTypes.map((type) => <span key={type}><ActivityIcon type={type} />{ACTIVITY_TYPE_LABELS[type]}</span>)}
      </div>
    </div>
  );
}

function Podium({ athletes, reduced }: { athletes: WeeklyRevealAthlete[]; reduced: boolean }) {
  return (
    <div className={styles.podium} aria-label="Weekly podium">
      {[2, 1, 3].map((rank) => {
        const athlete = athletes.find((entry) => entry.rank === rank);
        if (!athlete) return null;
        return (
          <motion.div key={athlete.athleteId} className={styles.podiumLane} data-rank={rank}
            initial={reduced ? false : { y: 110, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: reduced ? 0 : (3 - rank) * .17, type: "spring", stiffness: 130, damping: 18 }}>
            <div className={styles.podiumName}>{rank === 1 && <Trophy aria-hidden size={28} />}<strong>{athlete.name}</strong><span>{athlete.totalMinutes.toLocaleString("en-US")} min</span></div>
            <div className={styles.podiumBlock}><span>{rank}</span></div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function WeeklyRevealExperience({ recap, onComplete, saving = false, error = null }: {
  recap: WeeklyReveal;
  onComplete: () => void;
  saving?: boolean;
  error?: string | null;
}) {
  const reduced = Boolean(useReducedMotion());
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const scenes = useMemo<Scene[]>(() => [
    { id: "intro", duration: 2500 },
    ...[...recap.podium].reverse().map((athlete) => ({ id: `rank-${athlete.rank}`, duration: athlete.rank === 1 ? 5500 : 4500, athlete })),
    { id: "podium", duration: 3500 },
    { id: "growth", duration: 4500, athlete: recap.mostImproved ?? undefined },
    { id: "added", duration: 4500, athlete: recap.mostAdded ?? undefined },
    { id: "missed", duration: 3500 },
    { id: "zero", duration: 3500 },
    { id: "finish", duration: Infinity },
  ], [recap]);
  const total = scenes.slice(0, -1).reduce((sum, scene) => sum + scene.duration, 0);
  let sceneStart = 0;
  const scene = scenes.find((entry) => {
    if (elapsed < sceneStart + entry.duration) return true;
    sceneStart += entry.duration;
    return false;
  })!;
  const finished = scene.id === "finish";

  useEffect(() => {
    if (paused || finished) return;
    let last = performance.now();
    const resetClock = () => { last = performance.now(); };
    const interval = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.min(now - last, 250);
      if (document.visibilityState === "visible") {
        setElapsed((value) => Math.min(total, value + delta));
      }
      last = now;
    }, 100);
    document.addEventListener("visibilitychange", resetClock);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", resetClock);
    };
  }, [finished, paused, total]);

  const athlete = scene.athlete;
  const isRank = scene.id.startsWith("rank-");
  const isAward = scene.id === "growth" || scene.id === "added";
  const isCount = scene.id === "missed" || scene.id === "zero";
  const sceneTitle = isRank ? `${athlete!.rank === 1 ? "First" : athlete!.rank === 2 ? "Second" : "Third"} place`
    : scene.id === "growth" ? "Biggest leap"
    : scene.id === "added" ? "Minutes machine"
    : scene.id === "missed" ? "Missed the target"
    : scene.id === "zero" ? "Zero-minute club"
    : scene.id === "intro" ? "The week. The work. The winners."
    : scene.id === "finish" ? "New week. Your move." : "Your weekly podium";
  const theme = isRank ? `rank${athlete!.rank}` : scene.id;
  const announcement = isCount
    ? `${sceneTitle}: ${scene.id === "missed" ? recap.missedTargetCount : recap.zeroMinutesCount} athletes. Exempt athletes excluded.`
    : isAward && athlete
      ? `${sceneTitle}: ${athlete.name}, up ${scene.id === "growth" ? `${Math.round(athlete.percentChange!)} percent` : `${athlete.totalMinutes - athlete.previousWeekMinutes} minutes`} from the previous week.`
      : `${sceneTitle}${athlete ? `: ${athlete.name}, ${athlete.totalMinutes} minutes.` : ""}`;

  return (
    <Modal isOpen size="full" hideCloseButton isDismissable={false} isKeyboardDismissDisabled
      aria-label="Weekly team awards" classNames={{ wrapper: styles.modalWrapper, base: styles.modal }} disableAnimation>
      <ModalContent>
        <div className={styles.experience} data-theme={theme} data-scene={scene.id} data-paused={paused}>
          <header className={styles.header}>
            <div className={styles.brand}>rowbook<span>Weekly awards</span></div>
            <div className={styles.week}><strong>{recap.teamName}</strong><span>{formatWeekRange(recap.weekStartAt, recap.weekEndAt)}</span></div>
            {!finished && <Button variant="ghost" className={styles.pause} onPress={() => setPaused(!paused)} aria-label={paused ? "Resume awards" : "Pause awards"}>
              {paused ? <Play size={18} aria-hidden /> : <Pause size={18} aria-hidden />}<span>{paused ? "Resume" : "Pause"}</span>
            </Button>}
          </header>

          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
          <main className={styles.stage}>
            <AnimatePresence mode="wait">
              <motion.section key={scene.id} className={styles.scene} aria-labelledby={`reveal-${scene.id}`}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 32, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -24 }} transition={{ duration: reduced ? .12 : .35 }}>
                {scene.id === "intro" && <>
                  <p className={styles.kicker}>Last week is in the books.</p>
                  <h1 id={`reveal-${scene.id}`} className={styles.introTitle}>The week.<br />The work.<br /><em>The winners.</em></h1>
                  <p className={styles.subtitle}>{recap.athleteCount} athletes. One team. Every minute counts.</p>
                  <div className={styles.introRanks} aria-hidden><span>3</span><span>2</span><span>1</span></div>
                </>}

                {isRank && athlete && <>
                  <p className={styles.kicker}>The weekly top three</p>
                  <div className={styles.winner}>
                    <div className={styles.rankStamp} aria-label={sceneTitle}>{athlete.rank}<span>{athlete.rank === 1 ? "st" : athlete.rank === 2 ? "nd" : "rd"}</span></div>
                    <div className={styles.winnerDetails}>
                      <h1 id={`reveal-${scene.id}`} className={styles.athleteName}>{athlete.name}</h1>
                      <div className={styles.score}><strong><Count value={athlete.totalMinutes} reduced={reduced} /></strong><span>minutes</span></div>
                      <AthleteStats athlete={athlete} />
                    </div>
                  </div>
                  {athlete.rank === 1 && !reduced && <div className={styles.confetti} aria-hidden>{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * .13}s`, background: ["#1646dc", "#e34a61", "#fff9ed"][i % 3], transform: `rotate(${i * 23}deg)` }} />)}</div>}
                </>}

                {(scene.id === "podium" || finished) && <>
                  <p className={styles.kicker}>{finished ? "Make this one count." : "All that work adds up."}</p>
                  <h1 id={`reveal-${scene.id}`} className={styles.title}>{sceneTitle}</h1>
                  {recap.podium.length ? <Podium athletes={recap.podium} reduced={reduced} /> : <p className={styles.empty}>No credited minutes this week.<br />A new week starts here.</p>}
                  {finished && <div className={styles.finishActions}>
                    <Button onPress={onComplete} isLoading={saving} isDisabled={saving} autoFocus className={styles.continue}>{error ? "Try saving again" : "Let’s get to work"}</Button>
                    {error && <p role="alert" className={styles.error}>{error}</p>}
                  </div>}
                </>}

                {isAward && <>
                  <p className={styles.kicker}>{scene.id === "growth" ? "Largest percentage increase" : "Most minutes added"}</p>
                  <h1 id={`reveal-${scene.id}`} className={styles.title}>{sceneTitle}</h1>
                  {athlete ? <>
                    <div className={styles.awardNumber}>+<Count value={scene.id === "growth" ? Math.round(athlete.percentChange!) : athlete.totalMinutes - athlete.previousWeekMinutes} reduced={reduced} /><span>{scene.id === "growth" ? "%" : " min"}</span></div>
                    <h2 className={styles.awardName}>{athlete.name}</h2>
                    <p className={styles.comparison}>{athlete.previousWeekMinutes.toLocaleString("en-US")} → {athlete.totalMinutes.toLocaleString("en-US")} minutes</p>
                    <AthleteStats athlete={athlete} />
                  </> : <p className={styles.empty}>No qualifying increase this week.<br />Next week is another chance.</p>}
                  <p className={styles.rule}>Compared with the previous week. Requires minutes in both weeks.</p>
                </>}

                {isCount && <>
                  <span className={styles.emoji} role="img" aria-label={scene.id === "missed" ? "Sad face" : "Skull"}>{scene.id === "missed" ? "😢" : "💀"}</span>
                  <h1 id={`reveal-${scene.id}`} className={styles.countTitle}>{sceneTitle}</h1>
                  <div className={styles.teamCount}><Count value={scene.id === "missed" ? recap.missedTargetCount : recap.zeroMinutesCount} reduced={reduced} /></div>
                  <p className={styles.countDescription}>{scene.id === "missed" ? "athletes below their weekly minutes" : "athletes with no credited minutes"}</p>
                  <p className={styles.rule}>{scene.id === "missed" ? "Exempt athletes excluded. Includes zero-minute athletes." : "Exempt athletes excluded."}</p>
                </>}
              </motion.section>
            </AnimatePresence>
          </main>

          <footer className={styles.footer}>
            <span>{finished ? "That’s last week. This week is yours." : paused ? "Paused. Take your time." : "Your week, in the spotlight."}</span>
            <span>{finished ? "See you next week" : `${Math.ceil((total - elapsed) / 1000)}s remaining`}</span>
          </footer>
          <div className={styles.progress} role="progressbar" aria-label="Weekly awards progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsed / total * 100)}><span style={{ width: `${elapsed / total * 100}%` }} /></div>
        </div>
      </ModalContent>
    </Modal>
  );
}
