import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ClipboardCheck,
  Dumbbell,
  FileVideo,
  Package,
  Plus,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { patch, post, useMutation, useResource } from "./api";
import { BoxForm, ChallengeForm, WorkoutForm } from "./Forms";
import {
  Button,
  Empty,
  Field,
  Loading,
  Modal,
  Notice,
  PageHeading,
  SectionTitle,
  Status,
  currency,
  dateLabel,
  timeLabel,
} from "./ui";
import type { Box, Overview, Rental, Submission, User } from "./types";
function ReviewForm({
  submission,
  onSaved,
}: {
  submission: Submission;
  onSaved: () => void;
}) {
  const mutation = useMutation();
  const [decision, setDecision] = useState("approved");
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mutation.run(
      () =>
        post(`/submissions/${submission.id}/review`, {
          decision,
          reps: Number(f.get("reps")),
          time_seconds: Number(f.get("time")),
          reason: f.get("reason"),
        }),
      "Revisión guardada.",
      onSaved,
    );
  };
  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="review-context">
        <strong>{submission.athlete_name}</strong>
        <span>
          {submission.challenge_title} · {submission.box_name ?? "Atleta libre"}
        </span>
      </div>
      <video
        className="review-video"
        controls
        preload="metadata"
        src={submission.video_url || `/api/submissions/${submission.id}/video`}
      />
      <div className="form-callout">
        <Activity size={18} />
        <div>
          <strong>Propuesta automática preliminar</strong>
          <p>
            {submission.reps ?? "—"} reps · {timeLabel(submission.time_seconds)}
            {submission.confidence != null
              ? ` · confianza de puntos detectados ${Math.round(submission.confidence * 100)} %`
              : ""}
          </p>
          <p>{submission.analysis_note}</p>
        </div>
      </div>
      <div className="form-grid">
        <Field label="Repeticiones válidas">
          <input
            name="reps"
            type="number"
            min="0"
            max="10000"
            defaultValue={submission.reps ?? 0}
            required
          />
        </Field>
        <Field label="Tiempo oficial (segundos)">
          <input
            name="time"
            type="number"
            min="0.01"
            max="1800"
            step="0.01"
            defaultValue={submission.time_seconds ?? ""}
            required
          />
        </Field>
      </div>
      <Field label="Decisión del juez">
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="approved">Aprobar e incluir en el ranking</option>
          <option value="rejected">Rechazar el intento</option>
        </select>
      </Field>
      <Field label="Motivo / observaciones">
        <textarea
          name="reason"
          rows={3}
          required
          placeholder="Explica la validación o los motivos del rechazo."
          minLength={3}
          maxLength={1000}
        />
      </Field>
      <Notice error={mutation.error} />
      <Button type="submit" className="primary full" loading={mutation.pending}>
        <ClipboardCheck size={17} />
        Guardar revisión
        <ArrowRight size={17} />
      </Button>
    </form>
  );
}
export default function AdminView({ user }: { user: User }) {
  const overview = useResource<Overview>("/admin/overview");
  const boxes = useResource<Box[]>("/boxes");
  const submissions = useResource<Submission[]>("/submissions");
  const rentals = useResource<Rental[]>("/rentals");
  const [tab, setTab] = useState<"overview" | "reviews" | "boxes" | "rentals">(
    "overview",
  );
  const [modal, setModal] = useState<"workout" | "challenge" | "box" | null>(
    null,
  );
  const [review, setReview] = useState<Submission | null>(null);
  const mutation = useMutation();
  const pending =
    submissions.data?.filter((s) => ["review", "failed"].includes(s.status)) ??
    [];
  const refresh = () => {
    overview.refresh();
    boxes.refresh();
    submissions.refresh();
    rentals.refresh();
  };
  return (
    <>
      <PageHeading
        eyebrow="VECTOR CONTROL CENTER"
        title="El movimiento empieza contigo."
        description="Programa, conecta y valida cada paso del ecosistema Vector."
        action={
          <span className="admin-pill">
            <ShieldCheck size={16} />
            ADMINISTRADOR
          </span>
        }
      />
      <div className="admin-actions">
        <button onClick={() => setModal("workout")}>
          <Dumbbell size={23} />
          <div>
            <strong>Publicar entrenamiento</strong>
            <span>Programación Forge o Apex</span>
          </div>
          <Plus size={19} />
        </button>
        <button onClick={() => setModal("challenge")}>
          <Trophy size={23} />
          <div>
            <strong>Crear reto mensual</strong>
            <span>Una nueva meta para los boxes</span>
          </div>
          <Plus size={19} />
        </button>
        <button onClick={() => setModal("box")}>
          <Users size={23} />
          <div>
            <strong>Añadir un box</strong>
            <span>Haz crecer la comunidad</span>
          </div>
          <Plus size={19} />
        </button>
      </div>
      <div className="admin-tabs segmented">
        <button
          className={tab === "overview" ? "selected" : ""}
          onClick={() => setTab("overview")}
        >
          Vista general
        </button>
        <button
          className={tab === "reviews" ? "selected" : ""}
          onClick={() => setTab("reviews")}
        >
          Validación de vídeos<span>{pending.length}</span>
        </button>
        <button
          className={tab === "boxes" ? "selected" : ""}
          onClick={() => setTab("boxes")}
        >
          Boxes
        </button>
        <button
          className={tab === "rentals" ? "selected" : ""}
          onClick={() => setTab("rentals")}
        >
          Alquileres
          <span>
            {rentals.data?.filter((r) => r.status === "pending").length ?? 0}
          </span>
        </button>
      </div>
      <Notice
        error={overview.error || mutation.error}
        success={mutation.success}
      />
      {tab === "overview" && (
        <>
          {overview.loading ? (
            <Loading />
          ) : (
            <div className="stats-grid admin-stats">
              {[
                {
                  label: "Atletas y responsables",
                  value: overview.data?.users ?? 0,
                  icon: Users,
                },
                {
                  label: "Boxes conectados",
                  value: overview.data?.boxes ?? 0,
                  icon: ShieldCheck,
                },
                {
                  label: "Vídeos por validar",
                  value: overview.data?.pending_reviews ?? 0,
                  icon: ClipboardCheck,
                },
                {
                  label: "Alquileres pendientes",
                  value: overview.data?.pending_rentals ?? 0,
                  icon: Package,
                },
              ].map((s) => (
                <div className="stat-card" key={s.label}>
                  <div className="stat-top">
                    <span>{s.label}</span>
                    <s.icon size={18} />
                  </div>
                  <div className="stat-value">{s.value}</div>
                </div>
              ))}
            </div>
          )}
          <div className="card ai-status">
            <div
              className={`ai-status-icon ${overview.data?.ai.available ? "available" : ""}`}
            >
              <Activity size={24} />
            </div>
            <div>
              <h3>
                {overview.data?.ai.available
                  ? "Análisis de pose disponible"
                  : "El análisis de pose necesita configuración"}
              </h3>
              <p>
                {overview.data?.ai.detail ??
                  "Comprobando el servicio de análisis."}
              </p>
              <small>
                Los resultados de IA siempre requieren validación humana para
                entrar en el ranking.
              </small>
            </div>
            <Status
              value={overview.data?.ai.available ? "approved" : "pending"}
            />
          </div>
          <section className="card">
            <SectionTitle
              title="Personas que hacen Vector"
              subtitle="Cuentas y permisos del ecosistema."
            />
            {overview.data?.users_list.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>PERSONA</th>
                      <th>ROL</th>
                      <th>COMUNIDAD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.data.users_list.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                        </td>
                        <td>
                          <span className="role-badge">
                            {u.role === "admin"
                              ? "Administrador"
                              : u.role === "box_owner"
                                ? "Responsable de box"
                                : "Atleta"}
                          </span>
                        </td>
                        <td>{u.box_name ?? "Vector / libre"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="Las primeras cuentas están por llegar"
                description="Los perfiles aparecerán aquí al darse de alta."
              />
            )}
          </section>
        </>
      )}
      {tab === "reviews" && (
        <section className="card">
          <SectionTitle
            title="El criterio humano hace oficial la marca."
            subtitle="Revisa el vídeo completo, confirma repeticiones y tiempo, y registra tu decisión."
          />
          <Notice error={submissions.error} />
          {submissions.loading ? (
            <Loading />
          ) : pending.length ? (
            <div className="admin-review-list">
              {pending.map((s) => (
                <article key={s.id}>
                  <div className="submission-symbol">
                    <FileVideo size={22} />
                  </div>
                  <div>
                    <h3>{s.athlete_name}</h3>
                    <p>
                      {s.challenge_title} · {s.box_name ?? "Atleta libre"}
                    </p>
                    <small>
                      Propuesta: {s.reps ?? "—"} reps ·{" "}
                      {timeLabel(s.time_seconds)} · {dateLabel(s.created_at)}
                    </small>
                  </div>
                  <Status value={s.status} />
                  <Button className="primary" onClick={() => setReview(s)}>
                    Revisar
                    <ArrowRight size={16} />
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Todo al día"
              description="No hay intentos pendientes de validación. Los vídeos aparecerán aquí cuando termine su análisis."
            />
          )}
          <div className="review-history">
            <SectionTitle title="Historial de validaciones" />
            {submissions.data
              ?.filter((s) => ["approved", "rejected"].includes(s.status))
              .map((s) => (
                <div key={s.id} className="history-row">
                  <strong>{s.athlete_name}</strong>
                  <span>{s.challenge_title}</span>
                  <Status value={s.status} />
                  <button className="text-link" onClick={() => setReview(s)}>
                    Revisar
                    <ArrowRight size={14} />
                  </button>
                </div>
              ))}
          </div>
        </section>
      )}
      {tab === "boxes" && (
        <section className="card">
          <SectionTitle
            title="Una red con dos maneras de participar"
            subtitle="Solo los boxes oficiales pueden crear competiciones con la marca Vector."
            action={
              <Button className="outline" onClick={() => setModal("box")}>
                <Plus size={16} />
                Añadir box
              </Button>
            }
          />
          <Notice error={boxes.error} />
          {boxes.loading ? (
            <Loading />
          ) : boxes.data?.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>BOX</th>
                    <th>ATLETAS</th>
                    <th>TIPO / PERMISO DE MARCA</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.data.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.name}</strong>
                        <small>{b.city}</small>
                      </td>
                      <td>{b.athletes}</td>
                      <td>
                        <select
                          aria-label={`Tipo de ${b.name}`}
                          value={b.type}
                          disabled={mutation.pending}
                          onChange={(e) =>
                            mutation.run(
                              () =>
                                patch(`/boxes/${b.id}`, {
                                  type: e.target.value,
                                }),
                              `Tipo de ${b.name} actualizado.`,
                              refresh,
                            )
                          }
                        >
                          <option value="standard">
                            Estándar · marca propia
                          </option>
                          <option value="official">
                            Oficial · marca Vector
                          </option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Construye la red Vector"
              description="Añade tu primer box y su responsable para empezar."
            />
          )}
        </section>
      )}
      {tab === "rentals" && (
        <section className="card">
          <SectionTitle
            title="La logística del siguiente reto"
            subtitle="Confirma disponibilidad o rechaza una solicitud. El stock se verifica al confirmar."
          />
          <Notice error={rentals.error} />
          {rentals.loading ? (
            <Loading />
          ) : rentals.data?.length ? (
            <div className="rental-list">
              {rentals.data.map((r) => (
                <article className="rental-row" key={r.id}>
                  <div className="rental-row-top">
                    <div>
                      <span className="eyebrow">
                        SOLICITUD #{r.id} · {r.box_name ?? "VECTOR"}
                      </span>
                      <h3>{r.event_title}</h3>
                      <span className="meta">
                        {dateLabel(r.start_date)} — {dateLabel(r.end_date)}
                      </span>
                    </div>
                    <div>
                      <Status value={r.status} />
                      <strong className="rental-total">
                        {currency(r.total)}
                      </strong>
                    </div>
                  </div>
                  <div className="rental-items">
                    {r.items.map((i) => (
                      <span key={i.equipment_id}>
                        {i.quantity} × {i.name}
                      </span>
                    ))}
                  </div>
                  {r.notes && <p>{r.notes}</p>}
                  {r.status === "pending" && (
                    <div className="rental-admin-actions">
                      <Button
                        className="outline"
                        loading={mutation.pending}
                        onClick={() =>
                          mutation.run(
                            () =>
                              post(`/rentals/${r.id}/status`, {
                                status: "declined",
                              }),
                            "Solicitud rechazada.",
                            refresh,
                          )
                        }
                      >
                        <X size={16} />
                        Rechazar
                      </Button>
                      <Button
                        className="primary"
                        loading={mutation.pending}
                        onClick={() =>
                          mutation.run(
                            () =>
                              post(`/rentals/${r.id}/status`, {
                                status: "confirmed",
                              }),
                            "Reserva confirmada y material asignado.",
                            refresh,
                          )
                        }
                      >
                        <Check size={16} />
                        Confirmar disponibilidad
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="La logística está al día"
              description="Las solicitudes de alquiler de los boxes aparecerán aquí."
            />
          )}
        </section>
      )}
      {modal && (
        <Modal
          title={
            modal === "workout"
              ? "Nueva programación Vector"
              : modal === "challenge"
                ? "Nuevo reto mensual"
                : "Nuevo box Vector"
          }
          wide={modal !== "box"}
          onClose={() => setModal(null)}
        >
          {modal === "workout" ? (
            <WorkoutForm
              user={user}
              onSaved={() => {
                setModal(null);
                refresh();
              }}
            />
          ) : modal === "challenge" ? (
            <ChallengeForm
              onSaved={() => {
                setModal(null);
                refresh();
              }}
            />
          ) : (
            <BoxForm
              onSaved={() => {
                setModal(null);
                refresh();
              }}
            />
          )}
        </Modal>
      )}
      {review && (
        <Modal title="Validar intento" wide onClose={() => setReview(null)}>
          <ReviewForm
            submission={review}
            onSaved={() => {
              setReview(null);
              refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}
