import { useState } from "react";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { post, useMutation } from "./api";
import { Button, Field, Notice, movementLabels } from "./ui";
import type { User, Track } from "./types";
const today = () => new Date().toISOString().slice(0, 10);
export function WorkoutForm({
  user,
  onSaved,
}: {
  user: User;
  onSaved: () => void;
}) {
  const mutation = useMutation();
  const [track, setTrack] = useState<Track>("forge");
  const [exercises, setExercises] = useState([
    { movement: "squat", reps: 30, load_kg: 0 },
  ]);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mutation.run(
      () =>
        post("/workouts", {
          title: f.get("title"),
          track,
          scope: user.role === "admin" ? "vector" : "box",
          scheduled_date: f.get("date"),
          format: f.get("format"),
          duration_minutes: Number(f.get("duration")),
          level: f.get("level"),
          notes: f.get("notes"),
          exercises,
        }),
      "Entrenamiento publicado.",
      onSaved,
    );
  };
  return (
    <form onSubmit={submit} className="stack-form">
      <div className="form-callout">
        {user.role === "admin"
          ? "La programación Vector estará disponible para todos los atletas."
          : "Tu programación diaria estará disponible para los atletas de tu box."}
      </div>
      <Field label="Título del entrenamiento">
        <input
          name="title"
          placeholder="Ej. Engine builder 01"
          required
          maxLength={100}
          minLength={3}
        />
      </Field>
      <div className="form-grid">
        <Field label="Programa">
          <select
            value={track}
            onChange={(e) => setTrack(e.target.value as Track)}
          >
            <option value="forge">Vector Forge · CrossFit</option>
            <option value="apex">Vector Apex · Híbrido</option>
          </select>
        </Field>
        <Field label="Fecha de publicación">
          <input name="date" type="date" defaultValue={today()} required />
        </Field>
        <Field label="Formato">
          <select name="format">
            <option value="for_time">For time</option>
            <option value="amrap">AMRAP</option>
            <option value="emom">EMOM</option>
            <option value="strength">Fuerza</option>
          </select>
        </Field>
        <Field label="Duración / time cap (min)">
          <input
            name="duration"
            type="number"
            defaultValue="20"
            min="1"
            max="180"
            required
          />
        </Field>
        <Field label="Nivel">
          <select name="level">
            <option value="all">Todos los niveles</option>
            <option value="scaled">Scaled</option>
            <option value="rx">RX</option>
          </select>
        </Field>
      </div>
      <div className="form-exercises">
        <div className="section-title">
          <h3>Bloques del entrenamiento</h3>
          <button
            type="button"
            className="text-link"
            disabled={exercises.length >= 30}
            onClick={() =>
              setExercises([
                ...exercises,
                { movement: "burpee", reps: 10, load_kg: 0 },
              ])
            }
          >
            <Plus size={15} />
            Añadir
          </button>
        </div>
        {exercises.map((exercise, index) => (
          <div className="exercise-form-row" key={index}>
            <Field label={`Movimiento ${index + 1}`}>
              <select
                aria-label={`Movimiento ${index + 1}`}
                value={exercise.movement}
                onChange={(e) =>
                  setExercises(
                    exercises.map((x, i) =>
                      i === index ? { ...x, movement: e.target.value } : x,
                    ),
                  )
                }
              >
                {Object.entries(movementLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reps / metros">
              <input
                type="number"
                value={exercise.reps}
                min="1"
                max="10000"
                required
                onChange={(e) =>
                  setExercises(
                    exercises.map((x, i) =>
                      i === index ? { ...x, reps: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Carga (kg)">
              <input
                type="number"
                value={exercise.load_kg}
                min="0"
                max="500"
                step="0.5"
                onChange={(e) =>
                  setExercises(
                    exercises.map((x, i) =>
                      i === index
                        ? { ...x, load_kg: Number(e.target.value) }
                        : x,
                    ),
                  )
                }
              />
            </Field>
            <button
              type="button"
              disabled={exercises.length === 1}
              className="icon-button"
              onClick={() =>
                setExercises(exercises.filter((_, i) => i !== index))
              }
              aria-label={`Eliminar movimiento ${index + 1}`}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
      </div>
      <Field label="Instrucciones y adaptaciones">
        <textarea
          name="notes"
          rows={3}
          placeholder="Explica el estímulo, las rondas y las opciones de adaptación."
          required
          maxLength={4000}
        />
      </Field>
      <Notice error={mutation.error} />
      <Button type="submit" className="primary full" loading={mutation.pending}>
        Publicar entrenamiento
        <ArrowRight size={17} />
      </Button>
    </form>
  );
}
export function ChallengeForm({ onSaved }: { onSaved: () => void }) {
  const mutation = useMutation();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mutation.run(
      () =>
        post("/challenges", {
          title: f.get("title"),
          track: f.get("track"),
          movement: "squat",
          target_reps: Number(f.get("reps")),
          opens_at: new Date(String(f.get("opens"))).toISOString(),
          closes_at: new Date(String(f.get("closes"))).toISOString(),
          description: f.get("description"),
        }),
      "Reto publicado.",
      onSaved,
    );
  };
  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="form-callout">
        El análisis de pose inicial está preparado para sentadillas. Los
        resultados pasan por validación humana antes de aparecer en el ranking.
      </div>
      <Field label="Nombre del reto">
        <input
          name="title"
          placeholder="Ej. The 30 squat challenge"
          required
          maxLength={100}
          minLength={3}
        />
      </Field>
      <div className="form-grid">
        <Field label="Programa">
          <select name="track">
            <option value="forge">Vector Forge</option>
            <option value="apex">Vector Apex</option>
          </select>
        </Field>
        <Field label="Objetivo de sentadillas">
          <input
            name="reps"
            type="number"
            defaultValue="30"
            min="1"
            max="100"
            required
          />
        </Field>
        <Field label="Inicio">
          <input
            name="opens"
            type="datetime-local"
            required
            defaultValue={`${today()}T08:00`}
          />
        </Field>
        <Field label="Cierre">
          <input name="closes" type="datetime-local" required />
        </Field>
      </div>
      <Field label="Estándar y descripción">
        <textarea
          name="description"
          minLength={3}
          rows={4}
          placeholder="Define el movimiento, el encuadre y los criterios de validez."
          required
          maxLength={4000}
        />
      </Field>
      <Notice error={mutation.error} />
      <Button type="submit" className="primary full" loading={mutation.pending}>
        Crear reto mensual
        <ArrowRight size={17} />
      </Button>
    </form>
  );
}
export function EventForm({
  user,
  onSaved,
}: {
  user: User;
  onSaved: () => void;
}) {
  const mutation = useMutation();
  const canVector = user.role === "admin" || user.box_type === "official";
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mutation.run(
      () =>
        post("/events", {
          title: f.get("title"),
          track: f.get("track"),
          city: f.get("city"),
          date: f.get("date"),
          brand: f.get("brand"),
          description: f.get("description"),
        }),
      "Competición creada.",
      onSaved,
    );
  };
  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="form-callout">
        {canVector
          ? "Puedes organizar una competición presencial con la marca Vector o una competición independiente."
          : "Tu box puede organizar competiciones independientes y alquilar material Vector. La marca Vector se reserva a los boxes oficiales."}
      </div>
      <Field label="Nombre de la competición">
        <input
          name="title"
          placeholder="Ej. Vector City Games"
          required
          maxLength={100}
          minLength={3}
        />
      </Field>
      <div className="form-grid">
        <Field label="Modalidad">
          <select name="track">
            <option value="forge">CrossFit · Forge</option>
            <option value="apex">Híbrida · Apex</option>
            <option value="both">CrossFit + híbrida</option>
          </select>
        </Field>
        <Field label="Marca">
          <select name="brand">
            <option value="independent">Competición independiente</option>
            {canVector && (
              <option value="vector">Competición oficial Vector</option>
            )}
          </select>
        </Field>
        <Field label="Localidad">
          <input name="city" required minLength={2} maxLength={80} />
        </Field>
        <Field label="Fecha">
          <input name="date" type="date" min={today()} required />
        </Field>
      </div>
      <Field label="Descripción y detalles">
        <textarea
          name="description"
          minLength={3}
          rows={4}
          required
          maxLength={4000}
        />
      </Field>
      <Notice error={mutation.error} />
      <Button type="submit" className="primary full" loading={mutation.pending}>
        Crear competición
        <ArrowRight size={17} />
      </Button>
    </form>
  );
}
export function BoxForm({ onSaved }: { onSaved: () => void }) {
  const mutation = useMutation();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mutation.run(
      () =>
        post("/boxes", {
          name: f.get("name"),
          city: f.get("city"),
          type: f.get("type"),
          owner_name: f.get("owner_name"),
          owner_email: f.get("owner_email"),
          owner_password: f.get("owner_password"),
        }),
      "Box y responsable creados.",
      onSaved,
    );
  };
  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Nombre del box">
          <input name="name" required minLength={2} maxLength={100} />
        </Field>
        <Field label="Localidad">
          <input name="city" required minLength={2} maxLength={80} />
        </Field>
      </div>
      <Field label="Tipo de box">
        <select name="type">
          <option value="standard">Estándar · competiciones propias</option>
          <option value="official">Oficial · competiciones Vector</option>
        </select>
      </Field>
      <div className="form-divider">CUENTA DEL RESPONSABLE</div>
      <div className="form-grid">
        <Field label="Nombre del responsable">
          <input name="owner_name" required minLength={2} maxLength={80} />
        </Field>
        <Field label="Correo electrónico">
          <input name="owner_email" type="email" required />
        </Field>
      </div>
      <Field
        label="Contraseña inicial"
        hint="Comparte esta contraseña con el responsable por un canal privado."
      >
        <input
          name="owner_password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
        />
      </Field>
      <Notice error={mutation.error} />
      <Button type="submit" className="primary full" loading={mutation.pending}>
        Crear box
        <ArrowRight size={17} />
      </Button>
    </form>
  );
}
