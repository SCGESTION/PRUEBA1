import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Activity,
  Dumbbell,
  Trophy,
  Users,
  Flame,
  MapPin,
  CheckCircle2,
  Flag,
  CalendarDays,
} from "lucide-react";
import { useResource } from "./api";
import {
  Button,
  Empty,
  Loading,
  Notice,
  SectionTitle,
  TrackBadge,
  dateLabel,
  Mark,
  Status,
} from "./ui";
import type { User, Dashboard, Workout } from "./types";
import type { View } from "./App";
import { WorkoutCard, WorkoutDetail } from "./Workouts";
export function AthleteArt() {
  return (
    <svg
      className="athlete-art"
      viewBox="0 0 540 390"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="athlete-gradient"
          x1="200"
          y1="80"
          x2="400"
          y2="370"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fc7f58" />
          <stop offset="1" stopColor="#eb495e" />
        </linearGradient>
      </defs>
      <circle cx="330" cy="182" r="135" stroke="#73746d" strokeOpacity=".3" />
      <circle cx="330" cy="182" r="110" stroke="#73746d" strokeOpacity=".16" />
      <path
        d="M149 53h303M81 118h303M190 304h303"
        stroke="white"
        strokeOpacity=".12"
      />
      <path d="m350 11 160 285h-67L283 11z" fill="#f37b56" opacity=".11" />
      <path d="m330 385 196-336h-34L296 385z" fill="white" opacity=".03" />
      <path
        d="M345 78c-7-13-1-29 13-33s29 3 32 16c4 16-5 29-20 30-9 0-18-5-25-13Z"
        fill="url(#athlete-gradient)"
      />
      <path
        d="m345 105-37 40-61-21-36 19 4 11 41-9 60 35c10 5 20 2 28-7l24-27 36 35 66-25-3-17-58 9-29-41c-9-11-24-14-35-2Z"
        fill="url(#athlete-gradient)"
      />
      <path
        d="m346 165-44 63-81 1-39 64 17 9 41-48 78 11c12 1 22-3 29-14l33-45-34-41Z"
        fill="#e6e3db"
      />
      <path
        d="m369 177 38 70-9 67 47 27 8-16-30-25 16-64c2-8 0-16-4-23l-36-63-30 27Z"
        fill="#e6e3db"
      />
      <path
        d="m181 291-40 12 5 11 52-12-17-11ZM446 326l-4 21 45 5 3-11-44-15Z"
        fill="#f47d57"
      />
      <path d="m328 112 32 28m-49 26 25 18" stroke="#ffb89a" strokeWidth="2" />
      <path d="M217 358h288" stroke="white" strokeOpacity=".19" />
      <text
        x="385"
        y="378"
        fill="#a8a9a0"
        fontFamily="Arial,sans-serif"
        fontSize="10"
        letterSpacing="3"
      >
        ONE REP CLOSER
      </text>
      <path
        d="m144 207 40-40m-27 57 25-25M96 275l36-36"
        stroke="#e7e4db"
        strokeOpacity=".4"
        strokeWidth="2"
      />
    </svg>
  );
}
export default function DashboardView({
  user,
  navigate,
}: {
  user: User;
  navigate: (view: View) => void;
}) {
  const dashboard = useResource<Dashboard>("/dashboard");
  const workouts = useResource<Workout[]>("/workouts");
  const [selected, setSelected] = useState<Workout | null>(null);
  const data = dashboard.data;
  const challenge = data?.challenge;
  const max = Math.max(
    2,
    ...(data?.weekly_activity ?? []).map((d) => d.forge + d.apex),
  );
  const hasActivity = data?.weekly_activity.some((d) => d.forge + d.apex > 0);
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">TU ESPACIO. TU MOVIMIENTO.</span>
          <h1>
            Vamos a por más, {user.name.split(" ")[0]}
            <span className="coral">.</span>
          </h1>
        </div>
        <div className="athlete-tag">
          <span className="online-dot" />
          {user.box_name ??
            (user.role === "admin" ? "VECTOR HQ" : "ATLETA LIBRE")}
        </div>
      </div>
      <section className="hero-card">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="hero-dot" />
            BUILT FOR THE NEXT YOU
          </div>
          <h2>
            Tu siguiente
            <br />
            versión empieza <em>aquí.</em>
          </h2>
          <p>
            Más que entrenar. Un objetivo, una comunidad
            <br className="desktop-only" /> y una nueva oportunidad de
            superarte.
          </p>
          <Button className="hero-button" onClick={() => navigate("workouts")}>
            Encuentra tu entrenamiento
            <ArrowUpRight size={19} />
          </Button>
          <div className="hero-bottom">
            <span>
              <span className="tiny-dot forge" />
              FORGE
            </span>
            <span>
              <span className="tiny-dot apex" />
              APEX
            </span>
            <span className="hero-bottom-line" />
            <span>ONE COMMUNITY.</span>
          </div>
        </div>
        <AthleteArt />
        <div className="hero-index">01 / VECTOR PERFORMANCE</div>
      </section>
      <Notice error={dashboard.error} />
      {dashboard.loading && !data ? (
        <Loading />
      ) : (
        <div className="stats-grid">
          {(data?.stats ?? []).map((s, i) => {
            const Icon = [Activity, Dumbbell, Trophy, Users][i % 4];
            return (
              <div className="stat-card" key={s.label}>
                <div className="stat-top">
                  <span>{s.label}</span>
                  <Icon size={17} />
                </div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-detail">{s.detail}</div>
              </div>
            );
          })}
        </div>
      )}
      <div className="dashboard-programs">
        <button
          className="track-banner forge"
          onClick={() => navigate("workouts")}
        >
          <div className="track-banner-icon">
            <Dumbbell size={25} />
          </div>
          <div>
            <span className="eyebrow">STRENGTH MEETS SKILL</span>
            <h3>
              Vector <b>Forge</b>
            </h3>
            <p>CrossFit. Supera tu propia marca.</p>
          </div>
          <ArrowUpRight size={23} />
        </button>
        <button
          className="track-banner apex"
          onClick={() => navigate("workouts")}
        >
          <div className="track-banner-icon">
            <Activity size={25} />
          </div>
          <div>
            <span className="eyebrow">ENDURANCE MEETS POWER</span>
            <h3>
              Vector <b>Apex</b>
            </h3>
            <p>Híbrido. Encuentra tu siguiente nivel.</p>
          </div>
          <ArrowUpRight size={23} />
        </button>
      </div>
      <div className="dashboard-middle">
        <section className="card chart-card">
          <SectionTitle
            title="Tu ritmo semanal"
            subtitle="Cada sesión cuenta. Sigue construyendo."
            action={<span className="chart-range">Últimos 7 días</span>}
          />
          <div className="chart-legend">
            <span>
              <i className="forge" />
              Forge
            </span>
            <span>
              <i className="apex" />
              Apex
            </span>
          </div>
          <div className="weekly-chart">
            <div className="chart-lines">
              <span>{max}</span>
              <span>{Math.floor(max / 2)}</span>
              <span>0</span>
            </div>
            <div className="chart-bars">
              {(data?.weekly_activity ?? []).map((day, i) => (
                <div className="chart-day" key={i}>
                  <div className="chart-bar-space">
                    <div
                      className="chart-bar forge"
                      style={{ height: `${(day.forge / max) * 100}%` }}
                      title={`${day.forge} sesiones Forge`}
                    />
                    <div
                      className="chart-bar apex"
                      style={{ height: `${(day.apex / max) * 100}%` }}
                      title={`${day.apex} sesiones Apex`}
                    />
                  </div>
                  <span>
                    {day.day.length > 3
                      ? dateLabel(day.day, { weekday: "short" }).replace(
                          ".",
                          "",
                        )
                      : day.day}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-foot">
            <span className="chart-total">
              <Flame size={16} />
              {hasActivity
                ? "Tu constancia deja huella."
                : "Registra tu primera sesión para empezar."}
            </span>
            <button className="text-link" onClick={() => navigate("workouts")}>
              Entrenar
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
        <section className="challenge-teaser">
          <div className="challenge-teaser-top">
            <span className="eyebrow">THE MONTHLY CHALLENGE</span>
            <Trophy size={25} />
          </div>
          {challenge ? (
            <>
              <TrackBadge track={challenge.track} />
              <h3>{challenge.title}</h3>
              <p>
                {challenge.target_reps} sentadillas.
                <br />
                Tu esfuerzo. Tu comunidad. Tu posición.
              </p>
              <div className="challenge-teaser-meta">
                <span>
                  <Users size={15} />
                  {challenge.box_count} boxes
                </span>
                <span>
                  <CalendarDays size={15} />
                  Hasta {dateLabel(challenge.closes_at)}
                </span>
              </div>
              <Button
                className="challenge-button"
                onClick={() => navigate("challenge")}
              >
                Descubre el reto
                <ArrowUpRight size={18} />
              </Button>
            </>
          ) : (
            <>
              <h3>
                El siguiente reto
                <br />
                está en camino.
              </h3>
              <p>Prepárate para competir con la comunidad Vector.</p>
              <Button
                className="challenge-button"
                onClick={() => navigate("challenge")}
              >
                Ver retos
                <ArrowRight size={18} />
              </Button>
            </>
          )}
        </section>
      </div>
      <section className="weekly-workouts">
        <SectionTitle
          title="Tu próxima sesión"
          subtitle="Programación diseñada para avanzar."
          action={
            <button className="text-link" onClick={() => navigate("workouts")}>
              Ver todos
              <ArrowUpRight size={16} />
            </button>
          }
        />
        <Notice error={workouts.error} />
        {workouts.loading ? (
          <Loading />
        ) : workouts.data?.length ? (
          <div className="workout-grid dashboard-workouts">
            {workouts.data.slice(0, 3).map((w) => (
              <WorkoutCard key={w.id} workout={w} onOpen={setSelected} />
            ))}
          </div>
        ) : (
          <Empty
            icon="workout"
            title="El plan está calentando"
            description="Aquí aparecerá la programación de Vector y de tu box."
          />
        )}
      </section>
      <div className="dashboard-bottom">
        <section className="card activity-card">
          <SectionTitle
            title="El movimiento sigue"
            subtitle="Tu actividad reciente en Vector."
          />
          {data?.activity.length ? (
            <div className="activity-list">
              {data.activity.slice(0, 5).map((a) => (
                <div key={a.id} className="activity-row">
                  <span className={`activity-icon ${a.kind}`}>
                    <CheckCircle2 size={18} />
                  </span>
                  <div>
                    <strong>{a.title}</strong>
                    <span>{a.detail}</span>
                  </div>
                  <time>{dateLabel(a.date)}</time>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Tu historia empieza hoy"
              description="Completa un entrenamiento o participa en una competición para registrar tu actividad."
            />
          )}
        </section>
        <section className="community-card">
          <span className="eyebrow">STRONGER TOGETHER</span>
          <Mark />
          <h3>{data?.box?.name ?? "Tu comunidad te espera."}</h3>
          <p>
            {data?.box
              ? `${data.box.city} · ${data.box.athletes} atletas entrenando en la misma dirección.`
              : "Conecta con boxes y atletas que comparten tus ganas de ir más allá."}
          </p>
          {data?.box && (
            <span className="box-tag">
              <MapPin size={13} />
              {data.box.type === "official"
                ? "BOX OFICIAL VECTOR"
                : "BOX VECTOR"}
            </span>
          )}
          <button className="text-link" onClick={() => navigate("boxes")}>
            Explora la comunidad
            <ArrowUpRight size={17} />
          </button>
        </section>
      </div>
      {data && data.my_submissions.length > 0 && (
        <section className="card compact-submissions">
          <SectionTitle
            title="Tus últimos intentos"
            action={
              <button
                className="text-link"
                onClick={() => navigate("challenge")}
              >
                Ver detalle
                <ArrowRight size={15} />
              </button>
            }
          />
          {data.my_submissions.slice(0, 2).map((s) => (
            <div className="submission-mini" key={s.id}>
              <Flag size={18} />
              <span>{s.challenge_title}</span>
              <Status value={s.status} />
            </div>
          ))}
        </section>
      )}
      {selected && (
        <WorkoutDetail
          workout={selected}
          user={user}
          onClose={() => setSelected(null)}
          onCompleted={() => {
            dashboard.refresh();
            workouts.refresh();
          }}
        />
      )}
    </>
  );
}
