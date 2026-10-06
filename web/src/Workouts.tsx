import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Dumbbell,
  Plus,
  CalendarDays,
  Search,
} from "lucide-react";
import { post, useMutation, useResource } from "./api";
import {
  Button,
  Empty,
  Loading,
  Modal,
  Notice,
  PageHeading,
  TrackBadge,
  WorkoutMeta,
  dateLabel,
  movementLabels,
} from "./ui";
import { WorkoutForm } from "./Forms";
import type { User, Workout, Track } from "./types";
export function WorkoutCard({
  workout,
  onOpen,
}: {
  workout: Workout;
  onOpen: (workout: Workout) => void;
}) {
  return (
    <button
      className={`workout-card ${workout.track}`}
      onClick={() => onOpen(workout)}
    >
      <div className="workout-card-top">
        <TrackBadge track={workout.track} />
        <span className="workout-date">
          {dateLabel(workout.scheduled_date, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>
      <h3>{workout.title}</h3>
      <WorkoutMeta
        duration={workout.duration_minutes}
        format={workout.format}
      />
      <div className="workout-movements">
        {workout.exercises.slice(0, 3).map((e, i) => (
          <span key={i}>
            <strong>{e.reps}</strong> {movementLabels[e.movement] ?? e.movement}
            {e.load_kg ? ` · ${e.load_kg} kg` : ""}
          </span>
        ))}
        {workout.exercises.length > 3 && (
          <small>+ {workout.exercises.length - 3} movimientos</small>
        )}
      </div>
      <div className="workout-card-bottom">
        <span>
          {workout.scope === "vector"
            ? "Programación Vector"
            : (workout.box_name ?? "Tu box")}
        </span>
        <span className="circle-arrow">
          <ArrowUpRight size={18} />
        </span>
      </div>
    </button>
  );
}
export function WorkoutDetail({
  workout,
  user,
  onClose,
  onCompleted,
}: {
  workout: Workout;
  user: User;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const mutation = useMutation();
  return (
    <Modal title={workout.title} onClose={onClose}>
      <div className="workout-detail-top">
        <TrackBadge track={workout.track} />
        <WorkoutMeta
          duration={workout.duration_minutes}
          format={workout.format}
        />
      </div>
      <div className="detail-meta">
        <CalendarDays size={17} />
        {dateLabel(workout.scheduled_date, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        <span>
          ·{" "}
          {workout.level === "all"
            ? "Todos los niveles"
            : workout.level.toUpperCase()}
        </span>
      </div>
      <div className="exercise-list">
        {workout.exercises.map((e, i) => (
          <div key={i}>
            <span className="exercise-index">
              {String(i + 1).padStart(2, "0")}
            </span>
            <strong>{movementLabels[e.movement] ?? e.movement}</strong>
            <span>
              {e.reps}{" "}
              {["run", "row", "ski", "farmer_carry", "sled_push"].includes(
                e.movement,
              )
                ? "m"
                : "reps"}
              {e.load_kg ? ` / ${e.load_kg} kg` : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="workout-notes">{workout.notes}</p>
      <p className="detail-author">
        Programado por {workout.author_name} · {workout.box_name ?? "Vector"}
      </p>
      <Notice error={mutation.error} success={mutation.success} />
      {user.role === "athlete" && (
        <Button
          className="primary full"
          loading={mutation.pending}
          disabled={!!mutation.success}
          onClick={() =>
            mutation.run(
              () => post(`/workouts/${workout.id}/complete`),
              "Entrenamiento registrado. ¡Una repetición más cerca!",
              onCompleted,
            )
          }
        >
          <CheckCircle2 size={18} />
          {mutation.success ? "Completado" : "Marcar como completado"}
        </Button>
      )}
    </Modal>
  );
}
export default function WorkoutsView({
  user,
  search,
}: {
  user: User;
  search: string;
}) {
  const resource = useResource<Workout[]>("/workouts");
  const [track, setTrack] = useState<Track | "all">("all");
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState(search);
  const [selected, setSelected] = useState<Workout | null>(null);
  const [create, setCreate] = useState(false);
  const [success, setSuccess] = useState("");
  useEffect(() => setQuery(search), [search]);
  const workouts =
    resource.data?.filter(
      (w) =>
        (track === "all" || w.track === track) &&
        (scope === "all" || w.scope === scope) &&
        `${w.title} ${w.notes}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="EL TRABAJO DE HOY. LA FUERZA DE MAÑANA."
        title="Entrena con intención."
        description="Tu programación Vector y la de tu box, en el mismo lugar."
        action={
          user.role !== "athlete" ? (
            <Button className="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Publicar entrenamiento
            </Button>
          ) : undefined
        }
      />
      <div className="program-strip">
        <div className="program-label forge">
          <img src="/brand/forge.svg" alt="Vektor Forge" />
          <div>
            <strong>VECTOR FORGE</strong>
            <span>Fuerza. Técnica. CrossFit.</span>
          </div>
        </div>
        <div className="program-label apex">
          <img src="/brand/apex.svg" alt="Vektor Apex" />
          <div>
            <strong>VECTOR APEX</strong>
            <span>Motor. Resistencia. Híbrido.</span>
          </div>
        </div>
      </div>
      <Notice success={success} error={resource.error} />
      <div className="filter-bar">
        <div className="segmented">
          <button
            className={track === "all" ? "selected" : ""}
            onClick={() => setTrack("all")}
          >
            Todos
          </button>
          <button
            className={track === "forge" ? "selected forge" : ""}
            onClick={() => setTrack("forge")}
          >
            <span className="tiny-dot forge" />
            Forge
          </button>
          <button
            className={track === "apex" ? "selected apex" : ""}
            onClick={() => setTrack("apex")}
          >
            <span className="tiny-dot apex" />
            Apex
          </button>
        </div>
        <div className="filter-controls">
          <select
            aria-label="Origen del entrenamiento"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="all">Toda la programación</option>
            <option value="vector">Vector</option>
            <option value="box">Mi box</option>
          </select>
          <div className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar entrenamiento"
              aria-label="Buscar entrenamiento"
            />
          </div>
        </div>
      </div>
      {resource.loading ? (
        <Loading />
      ) : workouts.length ? (
        <div className="workout-grid">
          {workouts.map((w) => (
            <WorkoutCard key={w.id} workout={w} onOpen={setSelected} />
          ))}
        </div>
      ) : (
        <Empty
          icon="workout"
          title="Tu próxima sesión está por llegar"
          description="No hay entrenamientos que coincidan con estos filtros. Prueba otro programa o vuelve pronto."
        />
      )}
      <div className="training-note">
        <Dumbbell size={22} />
        <div>
          <strong>La mejor marca es volver mañana.</strong>
          <p>
            Adapta la carga a tu nivel. Prioriza siempre la técnica y entrena
            con tu entrenador.
          </p>
        </div>
      </div>
      {selected && (
        <WorkoutDetail
          user={user}
          workout={selected}
          onClose={() => setSelected(null)}
          onCompleted={resource.refresh}
        />
      )}{" "}
      {create && (
        <Modal
          title={
            user.role === "admin"
              ? "Nueva programación Vector"
              : "Nuevo entrenamiento del box"
          }
          onClose={() => setCreate(false)}
          wide
        >
          <WorkoutForm
            user={user}
            onSaved={() => {
              setCreate(false);
              setSuccess("Entrenamiento publicado correctamente.");
              resource.refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}
