import React, { useState, useEffect, useRef } from "react";
import {
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

// Web Audio API Ringtone Synthesizer (Loud repeating alarm bell/buzzer)
class AlarmRingerManager {
  constructor() {
    this.ctx = null;
    this.intervalId = null;
    this.isPlaying = false;
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;

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

  // Detect Electron environment and sync always-on-top
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.electronAPI) {
      setIsElectron(true);
      window.electronAPI.getAlwaysOnTop().then((status) => {
        setIsAlwaysOnTop(status);
      });
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
    const diffSeconds = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));

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

  // Countdown loop
  useEffect(() => {
    if (isActive && remainingSeconds > 0) {
      timerRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
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
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, remainingSeconds]);

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
          await PipModule.enterPipMode(238, 100);
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
});
