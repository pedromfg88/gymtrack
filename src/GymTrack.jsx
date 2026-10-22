import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Check, Plus, X, ChevronDown, Dumbbell, Flame, TrendingUp, RotateCcw } from "lucide-react";
import { exerciseKey, localISO, mergeLogsU, liveLogs, setDayEntry, loadLocal, saveLocal, loadAccount, saveAccount, clearAccount, createDrive, createSync } from "./store.mjs";
import { IS_NATIVE, authorize, dropToken, revokeAndForget, onResume, onBackButton, exitApp } from "./native.js";

/* ============================================================
   DADOS BASE — Planos de treino por período
   Cada plano tem os seus ciclos e exercícios. O histórico de
   peso/reps é guardado por NOME do exercício (normalizado),
   por isso continua disponível mesmo que o exercício deixe de
   estar no plano atual e volte a aparecer num plano futuro.
   ============================================================ */
const DEFAULT_PLANS = {
  plano_2026_06: {
    label: "Junho – Julho 2026",
    active: true,
    workouts: {
      1: {
        name: "Ciclo 1",
        focus: "Programa de Adaptação",
        color: "#C8FF3D",
        exercises: [
          { name: "Air Bike", type: "cardio" },
          { name: "Hack Squat", type: "legs_push" },
          { name: "Remada Comboio c/ triângulo", type: "pull" },
          { name: "Leg Extension", type: "legs_extend" },
          { name: "Puxador Frontal Pronado", type: "pull_down" },
          { name: "Peck Fly Invertido", type: "fly_rear" },
          { name: "ABS inferior isométrico", type: "core" },
        ],
      },
      2: {
        name: "Ciclo 2",
        focus: "Programa de Adaptação",
        color: "#3DD9FF",
        exercises: [
          { name: "Air Bike", type: "cardio" },
          { name: "Stiff com Barra", type: "hinge" },
          { name: "Adutores Máquina", type: "legs_adductor" },
          { name: "Abdutores mão na máquina", type: "legs_abductor" },
          { name: "Leg Curl", type: "legs_curl" },
          { name: "Biceps Banco Inclinado", type: "curl" },
          { name: "Elevação frontal + lateral", type: "raise" },
        ],
      },
      3: {
        name: "Ciclo 3",
        focus: "Programa de Adaptação",
        color: "#FF8A3D",
        exercises: [
          { name: "Air Bike", type: "cardio" },
          { name: "Chest press máquina", type: "press_chest" },
          { name: "Peck Fly", type: "fly" },
          { name: "ABS inferior isométrico", type: "core" },
          { name: "Biceps c/ Barra Martelo", type: "curl" },
          { name: "Press Ombros Sentado c/ Halteres", type: "press_shoulder" },
          { name: "Gémeos Máquina Sentado", type: "calf" },
        ],
      },
    },
  },
};

// (exerciseKey vem de ./store.mjs: "Hack Squat" tem sempre a mesma chave, em qualquer plano.)

const todayISO = () => localISO();

// Devolve a data (ISO) de segunda-feira da semana em que "date" cai.
// Os ciclos contam como "feitos" por semana (segunda a domingo), não por dia.
function startOfWeekISO(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = domingo, 1 = segunda, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return localISO(d);
}

function isSameWeek(dateISO, weekStartISO) {
  const weekStart = new Date(weekStartISO + "T00:00:00");
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const d = new Date(dateISO + "T00:00:00");
  return d >= weekStart && d < weekEnd;
}

const fmtDatePT = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
};

// Nomes de todos os exercícios dos planos (para o CSV mostrar sempre o nome certo)
const PLAN_NAMES = {};
Object.values(DEFAULT_PLANS).forEach((p) =>
  Object.values(p.workouts).forEach((w) => w.exercises.forEach((ex) => { PLAN_NAMES[exerciseKey(ex.name)] = ex.name; }))
);

const localKv = {
  get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignora */ } },
};

/* ============================================================
   COMPONENTE: Barra de progresso
   ============================================================ */
function LoadBar({ done, total, color, label = "Progresso desta semana" }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: "0.08em", color: "#8B8D93", textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: color }}>
          {done}/{total}
        </span>
      </div>
      <div style={{ height: 10, borderRadius: 5, background: "#22242A", overflow: "hidden", position: "relative" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 5,
            transition: "width 0.4s cubic-bezier(.4,1.4,.6,1)",
            boxShadow: pct > 0 ? `0 0 12px ${color}99` : "none",
          }}
        />
      </div>
    </div>
  );
}


/* ============================================================
   COMPONENTE: Linha de série (peso x reps) editável
   ============================================================ */
function SetRow({ set, index, onChange, onRemove, onFill, lastSet }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr 32px 32px", gap: 8, alignItems: "center", marginBottom: 8 }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#5C5E64", textAlign: "center" }}>
        {index + 1}
      </span>
      <div style={{ position: "relative" }}>
        <input
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={set.weight}
          onChange={(e) => onChange(index, "weight", e.target.value)}
          style={inputStyle}
        />
        <span style={unitStyle}>kg</span>
      </div>
      <div style={{ position: "relative" }}>
        <input
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={set.reps}
          onChange={(e) => onChange(index, "reps", e.target.value)}
          style={inputStyle}
        />
        <span style={unitStyle}>reps</span>
      </div>
      <button
        onClick={() => lastSet && onFill(index, lastSet)}
        disabled={!lastSet}
        aria-label="Preencher com último registo"
        title={lastSet ? `Último: ${lastSet.weight}kg × ${lastSet.reps}` : "Sem registo anterior"}
        style={{
          width: 32, height: 40,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent", border: "none",
          color: lastSet ? "#6B6D73" : "#2A2C32",
          cursor: lastSet ? "pointer" : "default",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <button
        onClick={() => onRemove(index)}
        aria-label="Remover série"
        style={{ width: 32, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: "#5C5E64", cursor: "pointer" }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  height: 40,
  background: "#15161A",
  border: "1px solid #2A2C32",
  borderRadius: 8,
  color: "#EDEDED",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 15,
  fontWeight: 600,
  padding: "0 40px 0 12px",
  outline: "none",
};

const unitStyle = {
  position: "absolute",
  right: 10,
  top: "50%",
  transform: "translateY(-50%)",
  fontSize: 11,
  color: "#5C5E64",
  pointerEvents: "none",
  fontFamily: "'JetBrains Mono', monospace",
};

/* ============================================================
   COMPONENTE: Pictograma do movimento (SVG simples, sem terceiros)
   ============================================================ */
function ExerciseIcon({ type, color }) {
  const stroke = color;
  const common = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

  const icons = {
    cardio: (
      <svg {...common}><circle cx="12" cy="6" r="2" /><path d="M7 21l2-7 3 2 2-5 3 4" /><path d="M9 14l-3 2" /></svg>
    ),
    legs_push: (
      <svg {...common}><circle cx="12" cy="4" r="1.8" /><path d="M12 6v5" /><path d="M12 11l-3 4v6" /><path d="M12 11l3 4v6" /><path d="M6 13h12" /></svg>
    ),
    legs_extend: (
      <svg {...common}><circle cx="7" cy="4" r="1.8" /><path d="M7 6v6l4 2" /><path d="M11 14h7" /><path d="M16 11l2 3" /></svg>
    ),
    legs_curl: (
      <svg {...common}><circle cx="6" cy="5" r="1.8" /><path d="M6 7v6h6" /><path d="M12 13l4-2" /><path d="M16 11l1-4" /></svg>
    ),
    legs_adductor: (
      <svg {...common}><circle cx="12" cy="4" r="1.8" /><path d="M12 6v6" /><path d="M12 12l-4 6" /><path d="M12 12l4 6" /><path d="M8 18l8-12" strokeDasharray="2 2" /></svg>
    ),
    legs_abductor: (
      <svg {...common}><circle cx="12" cy="4" r="1.8" /><path d="M12 6v6" /><path d="M12 12l-5 4" /><path d="M12 12l5 4" /><path d="M5 9l14 0" strokeDasharray="2 2" /></svg>
    ),
    hinge: (
      <svg {...common}><circle cx="9" cy="4" r="1.8" /><path d="M9 6l3 5" /><path d="M12 11h6" /><path d="M9 6l-2 8v6" /><path d="M9 6l2 6" /></svg>
    ),
    pull: (
      <svg {...common}><circle cx="12" cy="4" r="1.8" /><path d="M12 6v7" /><path d="M12 9l-6 1" /><path d="M12 9l6 1" /><path d="M12 13l-2 7" /><path d="M12 13l2 7" /></svg>
    ),
    pull_down: (
      <svg {...common}><circle cx="12" cy="4" r="1.8" /><path d="M12 6v4" /><path d="M12 10l-5-3" /><path d="M12 10l5-3" /><path d="M12 10v8" /></svg>
    ),
    fly: (
      <svg {...common}><circle cx="12" cy="4" r="1.8" /><path d="M12 6v5" /><path d="M12 11l-6-2" /><path d="M12 11l6-2" /><path d="M12 11v7" /></svg>
    ),
    fly_rear: (
      <svg {...common}><circle cx="12" cy="4" r="1.8" /><path d="M12 6v5" /><path d="M6 9l6 2 6-2" /><path d="M12 11v7" /></svg>
    ),
    curl: (
      <svg {...common}><circle cx="9" cy="4" r="1.8" /><path d="M9 6v6h5" /><path d="M14 12l2-4" /><path d="M9 12l-1 6" /></svg>
    ),
    raise: (
      <svg {...common}><circle cx="12" cy="4" r="1.8" /><path d="M12 6v6" /><path d="M12 9l-6-2" /><path d="M12 9l6-2" /><path d="M12 12l-2 6" /><path d="M12 12l2 6" /></svg>
    ),
    press_chest: (
      <svg {...common}><circle cx="12" cy="4" r="1.8" /><path d="M12 6v5" /><path d="M6 8l6 3 6-3" /><path d="M12 11v7" /></svg>
    ),
    press_shoulder: (
      <svg {...common}><circle cx="12" cy="4" r="1.8" /><path d="M12 6v3" /><path d="M12 9l-5-1" /><path d="M12 9l5-1" /><path d="M9 8V4M15 8V4" /><path d="M12 9v8" /></svg>
    ),
    core: (
      <svg {...common}><circle cx="6" cy="6" r="1.8" /><path d="M6 8l4 3-2 7" /><path d="M10 11l6-1" /><path d="M16 10l2 6" /></svg>
    ),
    calf: (
      <svg {...common}><circle cx="9" cy="4" r="1.8" /><path d="M9 6v8" /><path d="M9 14l6-1" /><path d="M9 19l1-5" /></svg>
    ),
  };

  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        background: "#15161A",
        border: "1px solid #24262B",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {icons[type] || icons.core}
    </div>
  );
}

function ExerciseCard({ exercise, log, doneThisWeek, lastSession, color, isOpen, onToggle, onSave, onClearToday }) {
  const todayEntry = log?.find((l) => l.date === todayISO());
  const hasTodayEntry = !!todayEntry && todayEntry.sets.some((s) => s.weight && s.reps);

  const emptySets = () => [
    { weight: "", reps: "" },
    { weight: "", reps: "" },
    { weight: "", reps: "" },
  ];

  const [sets, setSets] = useState(
    todayEntry?.sets?.length ? todayEntry.sets : emptySets()
  );

  useEffect(() => {
    setSets(todayEntry?.sets?.length ? todayEntry.sets : emptySets());
  }, [exercise.name, todayEntry]);

  const updateSet = (idx, field, value) => {
    const next = sets.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
    setSets(next);
  };

  const addSet = () => setSets([...sets, { weight: "", reps: "" }]);
  const removeSet = (idx) => setSets(sets.filter((_, i) => i !== idx));
  const fillSet = (idx, lastSet) => {
    const next = sets.map((s, i) => i === idx ? { weight: lastSet.weight, reps: lastSet.reps } : s);
    setSets(next);
  };

  const handleSave = () => {
    const validSets = sets.filter((s) => s.weight !== "" && s.reps !== "");
    onSave(exerciseKey(exercise.name), validSets, exercise.name);
  };

  return (
    <div
      style={{
        background: "#1A1C1F",
        borderRadius: 14,
        marginBottom: 10,
        border: doneThisWeek ? `1px solid ${color}55` : "1px solid #24262B",
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "16px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <ExerciseIcon type={exercise.type} color={color} />

        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: doneThisWeek ? color : "transparent",
            border: doneThisWeek ? "none" : "2px solid #3A3C42",
            transition: "all 0.25s ease",
          }}
        >
          {doneThisWeek && <Check size={17} strokeWidth={3} color="#0E0F11" />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600, color: doneThisWeek ? "#EDEDED" : "#C7C8CC", lineHeight: 1.3 }}>
            {exercise.name}
          </div>
          {lastSession && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#6B6D73", marginTop: 3 }}>
              Último: {lastSession.sets.map((s) => `${s.weight}×${s.reps}`).join(" · ")}
              <span style={{ color: "#4A4C52" }}> ({fmtDatePT(lastSession.date)})</span>
            </div>
          )}
        </div>

        <ChevronDown
          size={18}
          color="#5C5E64"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease", flexShrink: 0 }}
        />
      </button>

      {isOpen && (
        <div style={{ padding: "0 16px 16px 16px" }}>
          <div style={{ height: 1, background: "#24262B", marginBottom: 14 }} />

          {sets.map((s, i) => (
            <SetRow
              key={i}
              set={s}
              index={i}
              onChange={updateSet}
              onRemove={removeSet}
              onFill={fillSet}
              lastSet={lastSession?.sets?.reduce((max, s) => parseFloat(s.weight) >= parseFloat(max.weight || 0) ? s : max, lastSession.sets[0]) ?? null}
            />
          ))}

          <button
            onClick={addSet}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "1px dashed #3A3C42",
              borderRadius: 8,
              color: "#8B8D93",
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 12px",
              cursor: "pointer",
              marginBottom: 14,
              width: "100%",
              justifyContent: "center",
            }}
          >
            <Plus size={14} /> Adicionar série
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSave}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 10,
                background: color,
                border: "none",
                color: "#0E0F11",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              {hasTodayEntry ? "Atualizar registo" : "Marcar como feito"}
            </button>
            {hasTodayEntry && (
              <button
                onClick={() => onClearToday(exerciseKey(exercise.name))}
                aria-label="Limpar registo de hoje"
                style={{ width: 44, height: 44, borderRadius: 10, background: "transparent", border: "1px solid #3A3C42", color: "#8B8D93", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ECRÃ: Histórico de um exercício
   ============================================================ */
function HistoryView({ exercise, log, color, onBack }) {
  const sorted = [...(log || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  const maxWeight = Math.max(1, ...sorted.flatMap((l) => l.sets.map((s) => parseFloat(s.weight) || 0)));

  return (
    <div style={{ padding: "0 16px 32px" }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#8B8D93", fontSize: 14, fontWeight: 600, padding: "16px 0", cursor: "pointer" }}>
        ← Voltar
      </button>
      <h2 style={{ color: "#EDEDED", fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{exercise.name}</h2>
      <p style={{ color: "#6B6D73", fontSize: 13, marginBottom: 20 }}>
        {sorted.length} sessão{sorted.length !== 1 ? "ões" : ""} registada{sorted.length !== 1 ? "s" : ""}
      </p>

      {sorted.length === 0 && (
        <div style={{ color: "#5C5E64", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
          Ainda sem registos para este exercício.
        </div>
      )}

      {sorted.map((entry, i) => {
        const topSet = entry.sets.reduce((max, s) => (parseFloat(s.weight) > parseFloat(max.weight || 0) ? s : max), entry.sets[0] || {});
        const barPct = ((parseFloat(topSet.weight) || 0) / maxWeight) * 100;
        return (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "baseline" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#8B8D93", textTransform: "capitalize" }}>
                {fmtDatePT(entry.date)}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: color }}>
                {entry.sets.map((s) => `${s.weight}×${s.reps}`).join("  ·  ")}
              </span>
            </div>
            <div style={{ height: 6, background: "#1A1C1F", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(barPct, 4)}%`, background: color, borderRadius: 3 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   ECRÃ: Arquivo — lista de planos antigos (só consulta)
   ============================================================ */
function ArchiveView({ archivedPlans, logs, onBack, onOpenPlan }) {
  return (
    <div style={{ padding: "0 16px 32px" }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#8B8D93", fontSize: 14, fontWeight: 600, padding: "16px 0", cursor: "pointer" }}>
        ← Voltar
      </button>

      <h2 style={{ color: "#EDEDED", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Arquivo</h2>
      <p style={{ color: "#6B6D73", fontSize: 13, marginBottom: 20 }}>
        Planos anteriores, disponíveis para consulta. Os registos novos só ficam guardados no plano atual.
      </p>

      {archivedPlans.length === 0 && (
        <div style={{ color: "#5C5E64", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
          Ainda não existem planos antigos.
        </div>
      )}

      {archivedPlans.map(([planId, plan]) => (
        <div key={planId} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#8B8D93", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            {plan.label}
          </div>
          {Object.entries(plan.workouts).map(([key, w]) => (
            <button
              key={key}
              onClick={() => onOpenPlan(planId, key)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "#15161A",
                border: "1px solid #24262B",
                borderRadius: 12,
                padding: "14px 16px",
                marginBottom: 8,
                cursor: "pointer",
              }}
            >
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 19, fontWeight: 700, color: w.color, textTransform: "uppercase" }}>
                {w.name}
              </div>
              <div style={{ fontSize: 12.5, color: "#6B6D73", marginTop: 2 }}>{w.focus} · {w.exercises.length} exercícios</div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   ECRÃ: Detalhe de um ciclo arquivado (só consulta, sem inputs)
   ============================================================ */
function ArchivedWorkoutDetail({ workout, logs, onBack, onViewHistory }) {
  return (
    <div style={{ padding: "0 16px 32px" }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#8B8D93", fontSize: 14, fontWeight: 600, padding: "16px 0", cursor: "pointer" }}>
        ← Arquivo
      </button>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 800, color: workout.color, textTransform: "uppercase", lineHeight: 1 }}>
          {workout.name}
        </div>
        <div style={{ fontSize: 13.5, color: "#8B8D93", marginTop: 4, marginBottom: 4 }}>{workout.focus}</div>
        <div style={{ fontSize: 11.5, color: "#5C5E64", marginBottom: 16, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Plano arquivado · só consulta
        </div>
      </div>

      {workout.exercises.map((ex) => {
        const key = exerciseKey(ex.name);
        const log = logs[key] || [];
        const lastSession = [...log].sort((a, b) => (a.date < b.date ? 1 : -1))[0];

        return (
          <button
            key={key}
            onClick={() => onViewHistory(ex)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              textAlign: "left",
              background: "#1A1C1F",
              border: "1px solid #24262B",
              borderRadius: 14,
              padding: "14px 16px",
              marginBottom: 10,
              cursor: "pointer",
            }}
          >
            <ExerciseIcon type={ex.type} color={workout.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#C7C8CC" }}>{ex.name}</div>
              {lastSession ? (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#6B6D73", marginTop: 3 }}>
                  Último: {lastSession.sets.map((s) => `${s.weight}×${s.reps}`).join(" · ")}
                  <span style={{ color: "#4A4C52" }}> ({fmtDatePT(lastSession.date)})</span>
                </div>
              ) : (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#4A4C52", marginTop: 3 }}>
                  Sem registos
                </div>
              )}
            </div>
            <TrendingUp size={15} color="#5C5E64" />
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   ECRÃ: Lista de ciclos (Home) — mostra sempre o plano ativo
   ============================================================ */
/* ============================================================
   COMPONENTES: Conta Google + indicador do Drive
   Os registos só são enviados para a conta que o utilizador confirmou como sendo a dele.
   ============================================================ */
function AccountConfirm({ email, onYes, onNo }) {
  const btn = { flex: 1, padding: "10px 12px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" };
  return (
    <div style={{ marginTop: 12, background: "#1A1C1F", border: "1px solid #C8FF3D55", borderRadius: 14, padding: 14, maxWidth: 340 }}>
      <div style={{ fontSize: 13, color: "#C7C8CC", lineHeight: 1.5 }}>
        Ligado ao Google como <b style={{ color: "#C8FF3D", wordBreak: "break-all" }}>{email}</b>.
        <br />
        Os registos vão ficar no Drive desta conta, na pasta «GymTrack». É a tua conta pessoal?
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={onYes} style={{ ...btn, background: "#C8FF3D", border: "none", color: "#0E0F11" }}>Sim, usar esta</button>
        <button onClick={onNo} style={{ ...btn, background: "transparent", border: "1px solid #3A3C42", color: "#C7C8CC" }}>Não, mudar</button>
      </div>
    </div>
  );
}

function SyncPill({ sync, account, onTap, onConfirm, onSwitch }) {
  if (sync.state === "confirm") return <AccountConfirm email={sync.account} onYes={onConfirm} onNo={onSwitch} />;
  const hh = sync.at ? new Date(sync.at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : "";
  const states = {
    local: { t: "Só neste aparelho", c: "#8B8D93" },
    syncing: { t: "A sincronizar…", c: "#C8FF3D" },
    ok: { t: sync.dirty ? "Drive · por enviar" : `Drive ✓ ${hh}`, c: sync.dirty ? "#FFB020" : "#C8FF3D" },
    offline: { t: "Sem rede · guardado no telemóvel", c: "#FFB020" },
    login: { t: "Ligar ao Google Drive", c: "#FF6B5B" },
    error: { t: "Erro no Drive · tocar para repetir", c: "#FF6B5B" },
    wrong_account: { t: "Conta Google errada", c: "#FF6B5B" },
  };
  const st = states[sync.state] || states.local;
  const tappable = ["ok", "offline", "login", "error"].includes(sync.state);
  const note =
    sync.state === "error" && sync.message ? sync.message
    : sync.state === "wrong_account" ? `Ligada: ${sync.account}. Esta app só usa ${sync.expected}. Toca em "Mudar de conta" e escolhe a conta certa.`
    : sync.state === "login" && sync.hint === "switched" ? "Se voltar a aparecer a mesma conta, remove o acesso do GymTrack em myaccount.google.com/connections e toca outra vez."
    : "";
  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={tappable ? onTap : undefined}
        aria-label="Estado da sincronização com o Google Drive"
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 999,
          border: `1px solid ${st.c}55`, background: `${st.c}14`, color: st.c,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 600,
          cursor: tappable ? "pointer" : "default",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 4, background: st.c }} />
        {st.t}
      </button>
      {note && <div style={{ color: "#8B8D93", fontSize: 11.5, lineHeight: 1.4, marginTop: 6, maxWidth: 320 }}>{note}</div>}
      {IS_NATIVE && account && (
        <div style={{ color: "#6B6D73", fontSize: 11.5, marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ wordBreak: "break-all" }}>Conta: {account}</span>
          <button onClick={onSwitch} style={{ background: "transparent", border: "none", color: "#8B8D93", textDecoration: "underline", fontSize: 11.5, padding: 0, cursor: "pointer" }}>
            Mudar de conta
          </button>
        </div>
      )}
    </div>
  );
}

function WorkoutSelector({ activePlan, hasArchive, onOpenArchive, onOpenBackup, workouts, logs, onSelect, sync, onSyncTap, account, onConfirmAccount, onSwitchAccount }) {
  const weekStart = startOfWeekISO();

  return (
    <div style={{ padding: "20px 16px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#C8FF3D", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            <Flame size={14} />
            {new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 38,
              fontWeight: 800,
              color: "#EDEDED",
              lineHeight: 1,
              textTransform: "uppercase",
              letterSpacing: "0.01em",
            }}
          >
            Qual ciclo<br />esta semana?
          </h1>
          <SyncPill sync={sync} account={account} onTap={onSyncTap} onConfirm={onConfirmAccount} onSwitch={onSwitchAccount} />
        </div>

        {hasArchive && (
          <button
            onClick={onOpenArchive}
            aria-label="Ver planos antigos"
            style={{
              flexShrink: 0,
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #24262B",
              background: "#1A1C1F",
              color: "#8B8D93",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Arquivo
          </button>
        )}
        <button
          onClick={onOpenBackup}
          aria-label="Exportar ou importar histórico"
          style={{
            flexShrink: 0,
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #24262B",
            background: "#1A1C1F",
            color: "#8B8D93",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cópia
        </button>
      </div>

      <div style={{ fontSize: 12.5, color: "#5C5E64", marginBottom: 14, fontFamily: "'JetBrains Mono', monospace" }}>
        Plano atual: {activePlan.label}
      </div>

      {Object.entries(workouts).map(([key, w]) => {
        const total = w.exercises.length;
        const done = w.exercises.filter((ex) =>
          (logs[exerciseKey(ex.name)] || []).some(
            (l) => isSameWeek(l.date, weekStart) && l.sets.some((s) => s.weight && s.reps)
          )
        ).length;

        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              background: "#1A1C1F",
              border: "1px solid #24262B",
              borderRadius: 16,
              padding: "18px 18px 16px",
              marginBottom: 12,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 800, color: w.color, textTransform: "uppercase", lineHeight: 1 }}>
                  {w.name}
                </div>
                <div style={{ fontSize: 13, color: "#8B8D93", marginTop: 4 }}>{w.focus}</div>
              </div>
              <Dumbbell size={22} color={w.color} style={{ flexShrink: 0, marginTop: 2 }} />
            </div>
            <LoadBar done={done} total={total} color={w.color} label="Progresso desta semana" />
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   ECRÃ: Detalhe do ciclo (lista de exercícios)
   ============================================================ */
function WorkoutDetail({ workout, logs, onBack, onSaveSet, onClearToday, onViewHistory }) {
  const [openId, setOpenId] = useState(null);
  const today = todayISO();
  const weekStart = startOfWeekISO();
  const total = workout.exercises.length;
  const done = workout.exercises.filter((ex) =>
    (logs[exerciseKey(ex.name)] || []).some(
      (l) => isSameWeek(l.date, weekStart) && l.sets.some((s) => s.weight && s.reps)
    )
  ).length;

  return (
    <div style={{ padding: "0 16px 32px" }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#8B8D93", fontSize: 14, fontWeight: 600, padding: "16px 0", cursor: "pointer" }}>
        ← Ciclos
      </button>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 800, color: workout.color, textTransform: "uppercase", lineHeight: 1 }}>
          {workout.name}
        </div>
        <div style={{ fontSize: 13.5, color: "#8B8D93", marginTop: 4, marginBottom: 16 }}>{workout.focus}</div>
        <LoadBar done={done} total={total} color={workout.color} />
      </div>

      {workout.exercises.map((ex) => {
        const key = exerciseKey(ex.name);
        const log = logs[key] || [];
        const doneThisWeek = log.some((l) => isSameWeek(l.date, weekStart) && l.sets.some((s) => s.weight && s.reps));
        const lastSession = [...log].filter((l) => l.date !== today).sort((a, b) => (a.date < b.date ? 1 : -1))[0];

        return (
          <div key={key}>
            <ExerciseCard
              exercise={ex}
              log={log}
              doneThisWeek={doneThisWeek}
              lastSession={lastSession}
              color={workout.color}
              isOpen={openId === key}
              onToggle={() => setOpenId(openId === key ? null : key)}
              onSave={onSaveSet}
              onClearToday={onClearToday}
            />
            {openId === key && log.length > 0 && (
              <button
                onClick={() => onViewHistory(ex)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "#6B6D73", fontSize: 12.5, fontWeight: 600, margin: "-4px 0 14px 4px", cursor: "pointer" }}
              >
                <TrendingUp size={13} /> Ver histórico completo
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   ECRÃ: Cópia de segurança — exportar/importar histórico
   Transferência manual entre dispositivos (ligações externas
   são bloqueadas neste ambiente, por isso não há sincronização
   automática).
   ============================================================ */
function BackupView({ logs, onBack, onImport }) {
  const [mode, setMode] = useState("export");
  const [importText, setImportText] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copiar texto");
  const [importMsg, setImportMsg] = useState("");

  const exportText = JSON.stringify({ logs, exportedAt: todayISO() });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyLabel("Copiado ✓");
      setTimeout(() => setCopyLabel("Copiar texto"), 2000);
    } catch (e) {
      setCopyLabel("Seleciona e copia manualmente");
    }
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText.trim());
      const incoming = parsed.logs || parsed || {};
      onImport(incoming);
      setImportMsg("Importado com sucesso — o histórico foi juntado ao que já tinhas aqui.");
      setImportText("");
    } catch (e) {
      setImportMsg("Texto inválido. Confirma que colaste o texto completo, tal como foi exportado.");
    }
  };

  const tabStyle = (active) => ({
    flex: 1,
    padding: "10px 0",
    borderRadius: 10,
    border: `1px solid ${active ? "#C8FF3D" : "#24262B"}`,
    background: active ? "#C8FF3D22" : "#1A1C1F",
    color: active ? "#C8FF3D" : "#8B8D93",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  });

  const textareaStyle = {
    width: "100%",
    minHeight: 140,
    background: "#15161A",
    border: "1px solid #2A2C32",
    borderRadius: 10,
    color: "#C7C8CC",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11.5,
    lineHeight: 1.5,
    padding: 12,
    outline: "none",
    resize: "vertical",
    marginBottom: 12,
  };

  return (
    <div style={{ padding: "0 16px 32px" }}>
      <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#8B8D93", fontSize: 14, fontWeight: 600, padding: "16px 0", cursor: "pointer" }}>
        ← Voltar
      </button>

      <h2 style={{ color: "#EDEDED", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Cópia de segurança</h2>
      <p style={{ color: "#6B6D73", fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
        Usa isto para levares o teu histórico para outro telemóvel ou computador.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button onClick={() => setMode("export")} style={tabStyle(mode === "export")}>Exportar</button>
        <button onClick={() => setMode("import")} style={tabStyle(mode === "import")}>Importar</button>
      </div>

      {mode === "export" && (
        <>
          <p style={{ color: "#8B8D93", fontSize: 12.5, lineHeight: 1.6, marginBottom: 10 }}>
            Copia este texto e guarda-o (nota, email, WhatsApp para ti próprio). No outro dispositivo, abre esta app, vai a "Importar" e cola-o.
          </p>
          <textarea
            readOnly
            value={exportText}
            onFocus={(e) => e.target.select()}
            style={textareaStyle}
          />
          <button
            onClick={handleCopy}
            style={{
              width: "100%", height: 46, borderRadius: 10, background: "#C8FF3D",
              border: "none", color: "#0E0F11", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            {copyLabel}
          </button>
        </>
      )}

      {mode === "import" && (
        <>
          <p style={{ color: "#8B8D93", fontSize: 12.5, lineHeight: 1.6, marginBottom: 10 }}>
            Cola aqui o texto que exportaste no outro dispositivo.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Cola aqui o texto exportado..."
            style={textareaStyle}
          />
          <button
            onClick={handleImport}
            disabled={!importText.trim()}
            style={{
              width: "100%", height: 46, borderRadius: 10,
              background: importText.trim() ? "#C8FF3D" : "#2A2C32",
              border: "none", color: "#0E0F11", fontWeight: 700, fontSize: 14,
              cursor: importText.trim() ? "pointer" : "default",
            }}
          >
            Importar e juntar ao histórico
          </button>
          {importMsg && (
            <div style={{ color: importMsg.startsWith("Importado") ? "#C8FF3D" : "#FF4747", fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
              {importMsg}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   APP RAIZ
   ============================================================ */
export default function GymApp() {
  const [data, setData] = useState(null);
  const [view, setView] = useState({ screen: "home" });
  const [loaded, setLoaded] = useState(false);
  const [sync, setSync] = useState({ state: IS_NATIVE ? "syncing" : "local" });
  const [account, setAccount] = useState(() => (IS_NATIVE ? loadAccount() : ""));
  const accountRef = useRef(account);
  accountRef.current = account;
  const dataRef = useRef(null);
  const syncRef = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  // guarda no telemóvel (sempre) e atualiza o ecrã
  const commit = useCallback((next) => {
    dataRef.current = next;
    setData(next);
    saveLocal(next);
  }, []);

  useEffect(() => {
    const local = loadLocal();
    const first = { plans: DEFAULT_PLANS, logs: local.logs, names: local.names };
    dataRef.current = first;
    setData(first);
    setLoaded(true);
    if (!IS_NATIVE) return undefined;      // fora da APK: só guarda neste aparelho

    const syncer = createSync({
      drive: createDrive({ getToken: () => authorize(false), onBadToken: dropToken }),
      getLocal: () => ({ logs: dataRef.current.logs, names: { ...dataRef.current.names, ...PLAN_NAMES } }),
      applyRemote: ({ logs, names }) => {
        const cur = dataRef.current;
        commit({ ...cur, logs: mergeLogsU(cur.logs, logs), names: { ...names, ...cur.names } });
      },
      setStatus: setSync,
      kv: localKv,
      getAccount: () => accountRef.current,
    });
    syncRef.current = syncer;
    syncer.syncNow();
    const offResume = onResume(() => syncer.syncNow());
    const onOnline = () => syncer.syncNow();
    window.addEventListener("online", onOnline);
    const iv = setInterval(() => syncer.retryIfNeeded(), 60000);
    return () => { offResume(); window.removeEventListener("online", onOnline); clearInterval(iv); };
  }, [commit]);

  // botão "voltar" do Android: sobe um nível; no ecrã inicial fecha a app
  useEffect(
    () =>
      onBackButton(() => {
        const v = viewRef.current;
        if (v.screen === "home") exitApp();
        else if (v.screen === "history")
          setView(v.from === "archive" ? { screen: "archived-workout", planId: v.planId, key: v.key } : { screen: "workout", key: v.key });
        else if (v.screen === "archived-workout") setView({ screen: "archive" });
        else setView({ screen: "home" });
      }),
    []
  );

  const live = useMemo(() => liveLogs(data ? data.logs : {}), [data]);

  const persist = (next) => {
    commit(next);
    if (syncRef.current) syncRef.current.markDirty();
  };

  const handleSyncTap = async () => {
    const s = syncRef.current;
    if (!s) return;
    if (sync.state === "login") {
      try {
        await authorize(true);
      } catch (e) {
        const code = e && e.code ? String(e.code) : "";
        setSync({
          state: "error",
          message: code === "api_10" ? "Google Cloud: o cliente Android (pacote/SHA-1) não corresponde a esta APK." : (e && e.message) || "Não foi possível ligar ao Google Drive.",
        });
        return;
      }
    }
    s.syncNow();
  };

  const handleConfirmAccount = () => {
    if (!sync.account) return;
    saveAccount(sync.account);
    accountRef.current = sync.account;
    setAccount(sync.account);
    if (syncRef.current) syncRef.current.syncNow();
  };

  const handleSwitchAccount = async () => {
    await revokeAndForget();
    clearAccount();
    accountRef.current = "";
    setAccount("");
    if (syncRef.current) syncRef.current.resetAccount();
    setSync({ state: "login", hint: "switched" });
  };

  if (!loaded || !data) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0E0F11", color: "#5C5E64", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
        A carregar...
      </div>
    );
  }

  const planEntries0 = Object.entries(data.plans);
  const activeEntry0 = planEntries0.find(([, p]) => p.active) || planEntries0[0];
  const metaFor = (cycleKey) => {
    const w = activeEntry0[1].workouts[cycleKey];
    return { p: activeEntry0[1].label, c: w ? w.name : "" };
  };

  const handleSaveSet = (exerciseId, sets, name) => {
    const logs = setDayEntry(data.logs, exerciseId, todayISO(), sets, metaFor(view.key));
    persist({ ...data, logs, names: name ? { ...data.names, [exerciseId]: name } : data.names });
  };

  const handleClearToday = (exerciseId) => {
    persist({ ...data, logs: setDayEntry(data.logs, exerciseId, todayISO(), [], {}) });
  };

  const handleImportLogs = (incoming) => {
    const now = Date.now();
    const stamped = {};
    for (const [k, es] of Object.entries(incoming || {})) stamped[k] = (es || []).map((e) => ({ ...e, u: e.u || now }));
    persist({ ...data, logs: mergeLogsU(data.logs, stamped) });
  };

  const planEntries = Object.entries(data.plans);
  const activeEntry = planEntries.find(([, p]) => p.active) || planEntries[0];
  const activePlan = activeEntry[1];
  const archivedEntries = planEntries.filter(([id]) => id !== activeEntry[0]);

  return (
    <div style={{ minHeight: "calc(100vh - var(--sat, 0px) - var(--sab, 0px))", background: "#0E0F11", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input:focus { border-color: #C8FF3D !important; }
        @media (prefers-reduced-motion: reduce) {
          * { transition: none !important; }
        }
      `}</style>

      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {view.screen === "backup" && (
          <BackupView
            logs={live}
            onBack={() => setView({ screen: "home" })}
            onImport={handleImportLogs}
          />
        )}

        {view.screen === "home" && (
          <WorkoutSelector
            activePlan={activePlan}
            hasArchive={archivedEntries.length > 0}
            onOpenArchive={() => setView({ screen: "archive" })}
            onOpenBackup={() => setView({ screen: "backup" })}
            workouts={activePlan.workouts}
            logs={live}
            onSelect={(key) => setView({ screen: "workout", key })}
            sync={sync}
            onSyncTap={handleSyncTap}
            account={account}
            onConfirmAccount={handleConfirmAccount}
            onSwitchAccount={handleSwitchAccount}
          />
        )}

        {view.screen === "workout" && (
          <WorkoutDetail
            workout={activePlan.workouts[view.key]}
            logs={live}
            onBack={() => setView({ screen: "home" })}
            onSaveSet={handleSaveSet}
            onClearToday={handleClearToday}
            onViewHistory={(ex) => setView({ screen: "history", from: "home", key: view.key, exercise: ex, color: activePlan.workouts[view.key].color })}
          />
        )}

        {view.screen === "archive" && (
          <ArchiveView
            archivedPlans={archivedEntries}
            logs={live}
            onBack={() => setView({ screen: "home" })}
            onOpenPlan={(planId, key) => setView({ screen: "archived-workout", planId, key })}
          />
        )}

        {view.screen === "archived-workout" && (
          <ArchivedWorkoutDetail
            workout={data.plans[view.planId].workouts[view.key]}
            logs={live}
            onBack={() => setView({ screen: "archive" })}
            onViewHistory={(ex) =>
              setView({
                screen: "history",
                from: "archive",
                planId: view.planId,
                key: view.key,
                exercise: ex,
                color: data.plans[view.planId].workouts[view.key].color,
              })
            }
          />
        )}

        {view.screen === "history" && (
          <HistoryView
            exercise={view.exercise}
            log={live[exerciseKey(view.exercise.name)]}
            color={view.color}
            onBack={() =>
              view.from === "archive"
                ? setView({ screen: "archived-workout", planId: view.planId, key: view.key })
                : setView({ screen: "workout", key: view.key })
            }
          />
        )}
      </div>
    </div>
  );
}
