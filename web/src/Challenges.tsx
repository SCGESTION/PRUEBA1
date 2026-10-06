import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Upload,
  Video,
  Trophy,
  CheckCircle2,
  CalendarDays,
  Users,
  ShieldCheck,
  Target,
  FileVideo,
  Plus,
  Activity,
} from "lucide-react";
import { post, useMutation, useResource } from "./api";
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
  TrackBadge,
  dateLabel,
  timeLabel,
} from "./ui";
import { ChallengeForm } from "./Forms";
import type { Challenge, Leaderboard, Submission, User } from "./types";
function uploadVideo(
  challenge: number,
  file: File,
  onProgress: (percent: number) => void,
): Promise<Submission> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/challenges/${challenge}/submissions`);
    request.withCredentials = true;
    request.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    request.onload = () => {
      let body;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        reject(new Error("El servidor no pudo procesar el vídeo."));
        return;
      }
      if (request.status >= 200 && request.status < 300) resolve(body);
      else
        reject(
          new Error(
            typeof body.detail === "string"
              ? body.detail
              : "No se pudo subir el vídeo.",
          ),
        );
    };
    request.onerror = () =>
      reject(
        new Error(
          "Se interrumpió la conexión. Comprueba tu red e inténtalo de nuevo.",
        ),
      );
    const form = new FormData();
    form.append("video", file);
    form.append("consent", "true");
    request.send(form);
  });
}
function PoseGraphic() {
  return (
    <svg className="pose-graphic" viewBox="0 0 230 180" aria-hidden="true">
      <defs>
        <pattern
          id="pose-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path d="M20 0H0v20" fill="none" stroke="#d7d9ce" strokeWidth=".6" />
        </pattern>
      </defs>
      <rect width="230" height="180" rx="16" fill="url(#pose-grid)" />
      <rect
        x="55"
        y="19"
        width="127"
        height="141"
        rx="8"
        fill="none"
        stroke="#9aac72"
        strokeDasharray="5 4"
      />
      <circle
        cx="113"
        cy="43"
        r="13"
        fill="#e9eddd"
        stroke="#1d2d21"
        strokeWidth="2"
      />
      <path
        d="m110 59-14 45 36 8-3 34m-30-43-25 32 4 15m27-81 33 24 23-10m-54-14-25 20-19-3"
        fill="none"
        stroke="#28382b"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[
        [110, 59],
        [96, 104],
        [132, 112],
        [129, 146],
        [74, 135],
        [78, 150],
        [139, 93],
        [162, 83],
        [82, 89],
        [63, 86],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill="#b4c686" />
      ))}
      <path d="M66 157h92" stroke="#59624d" strokeWidth="2" />
      <text
        x="67"
        y="173"
        fontFamily="Arial,sans-serif"
        fontSize="8"
        fill="#52614a"
        letterSpacing="1.5"
      >
        POSE / SQUAT DETECTION
      </text>
    </svg>
  );
}
export default function ChallengesView({ user }: { user: User }) {
  const challenges = useResource<Challenge[]>("/challenges");
  const submissions = useResource<Submission[]>("/submissions");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ranking, setRanking] = useState<"athletes" | "boxes">("athletes");
  const [upload, setUpload] = useState(false);
  const [create, setCreate] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileError, setFileError] = useState("");
  const mutation = useMutation();
  const enrollment = useMutation();
  const selected =
    challenges.data?.find((c) => c.id === selectedId) ??
    challenges.data?.find((c) => c.status === "open") ??
    challenges.data?.[0];
  const leader = useResource<Leaderboard>(
    selected ? `/challenges/${selected.id}/leaderboard` : null,
  );
  const activeSubmissions =
    submissions.data?.filter((s) => s.challenge_id === selected?.id) ?? [];
  useEffect(() => {
    if (
      !submissions.data?.some(
        (s) => s.status === "queued" || s.status === "processing",
      )
    )
      return;
    const interval = window.setInterval(submissions.refresh, 3500);
    return () => window.clearInterval(interval);
  }, [submissions.data, submissions.refresh]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !selected) return;
    mutation.run(
      () => uploadVideo(selected.id, file, setProgress),
      "Vídeo recibido. El análisis se inicia en segundo plano.",
      () => {
        submissions.refresh();
        challenges.refresh();
        setFile(null);
        setProgress(0);
        setConsent(false);
      },
    );
  };
  return (
    <>
      <PageHeading
        eyebrow="UN RETO. TODA LA COMUNIDAD."
        title="Demuestra de qué estás hecho."
        description="Entrenamientos cortos. Esfuerzos grandes. Compite con los atletas y boxes de Vector."
        action={
          user.role === "admin" ? (
            <Button className="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Crear reto
            </Button>
          ) : undefined
        }
      />
      <Notice error={challenges.error} />
      {challenges.loading && !challenges.data ? (
        <Loading />
      ) : !selected ? (
        <Empty
          icon="flag"
          title="El próximo reto está en preparación"
          description="Pronto tendrás una nueva oportunidad para medir tu progreso junto a la comunidad."
        />
      ) : (
        <>
          <div className="challenge-selector">
            {(challenges.data ?? []).map((c) => (
              <button
                key={c.id}
                className={c.id === selected.id ? "selected" : ""}
                onClick={() => setSelectedId(c.id)}
              >
                {c.title}
                <Status value={c.status} />
              </button>
            ))}
          </div>
          <div className="challenge-layout">
            <section className={`challenge-main-card ${selected.track}`}>
              <div className="challenge-main-top">
                <TrackBadge track={selected.track} />
                <Status value={selected.status} />
              </div>
              <span className="eyebrow">VECTOR MONTHLY CHALLENGE</span>
              <h2>{selected.title}</h2>
              <div className="challenge-target">
                <strong>{selected.target_reps}</strong>
                <div>
                  <span>SENTADILLAS</span>
                  <p>En el menor tiempo posible.</p>
                </div>
                <Target size={34} />
              </div>
              <p className="challenge-description">{selected.description}</p>
              <div className="challenge-dates">
                <span>
                  <CalendarDays size={17} />
                  <strong>
                    {dateLabel(selected.opens_at)} —{" "}
                    {dateLabel(selected.closes_at, {
                      day: "numeric",
                      month: "long",
                    })}
                  </strong>
                </span>
                <span>
                  <Users size={17} />
                  <strong>
                    {selected.box_count} boxes · {selected.submission_count}{" "}
                    intentos
                  </strong>
                </span>
              </div>
              {user.role === "athlete" && (
                <Button
                  className="primary"
                  onClick={() => {
                    setUpload(true);
                    mutation.clear();
                  }}
                  disabled={selected.status !== "open"}
                >
                  <Upload size={18} />
                  {selected.status === "open"
                    ? "Subir mi intento"
                    : selected.status === "upcoming"
                      ? "El reto abre próximamente"
                      : "Reto finalizado"}
                  <ArrowUpRight size={18} />
                </Button>
              )}
              {user.role === "box_owner" && (
                <>
                  <Notice
                    error={enrollment.error}
                    success={enrollment.success}
                  />
                  <Button
                    className="primary"
                    loading={enrollment.pending}
                    disabled={selected.enrolled || selected.status === "closed"}
                    onClick={() =>
                      enrollment.run(
                        () => post(`/challenges/${selected.id}/enroll`),
                        "Tu box ya participa en este reto.",
                        () => challenges.refresh(),
                      )
                    }
                  >
                    {selected.enrolled ? (
                      <>
                        <CheckCircle2 size={17} />
                        Tu box ya está dentro
                      </>
                    ) : (
                      <>
                        <Users size={17} />
                        Inscribir a mi box
                        <ArrowRight size={17} />
                      </>
                    )}
                  </Button>
                </>
              )}
            </section>
            <aside className="challenge-how card">
              <span className="eyebrow">ASÍ FUNCIONA</span>
              <h3>Tu esfuerzo, validado.</h3>
              <div className="how-step">
                <span>01</span>
                <div>
                  <strong>Graba tu entrenamiento</strong>
                  <p>Plano lateral, cuerpo completo y una sola toma.</p>
                </div>
              </div>
              <div className="how-step">
                <span>02</span>
                <div>
                  <strong>La IA analiza el movimiento</strong>
                  <p>Detecta la pose y propone repeticiones y tiempo.</p>
                </div>
              </div>
              <div className="how-step">
                <span>03</span>
                <div>
                  <strong>Un juez confirma tu resultado</strong>
                  <p>Solo los intentos aprobados entran en el ranking.</p>
                </div>
              </div>
              <div className="ai-disclaimer">
                <ShieldCheck size={19} />
                <p>
                  El análisis automático es preliminar. La validación humana
                  decide el resultado oficial.
                </p>
              </div>
            </aside>
          </div>
          <div className="ranking-layout">
            <section className="card leaderboard-card">
              <SectionTitle
                title="Cada segundo cuenta."
                subtitle="Clasificación oficial · resultados aprobados"
                action={<Trophy className="coral" size={23} />}
              />
              <div className="ranking-tabs segmented">
                <button
                  className={ranking === "athletes" ? "selected" : ""}
                  onClick={() => setRanking("athletes")}
                >
                  Atletas
                </button>
                <button
                  className={ranking === "boxes" ? "selected" : ""}
                  onClick={() => setRanking("boxes")}
                >
                  Boxes
                </button>
              </div>
              <Notice error={leader.error} />
              {leader.loading ? (
                <Loading />
              ) : leader.data?.[ranking].length ? (
                <div className="table-scroll">
                  <table className="ranking-table">
                    <thead>
                      <tr>
                        <th>POS.</th>
                        <th>
                          {ranking === "athletes" ? "ATLETA / BOX" : "BOX"}
                        </th>
                        <th>{ranking === "athletes" ? "REPS" : "ATLETAS"}</th>
                        <th>TIEMPO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking === "athletes"
                        ? leader.data.athletes.map((row) => (
                            <tr key={row.submission_id}>
                              <td>
                                <span
                                  className={`rank ${row.rank <= 3 ? "podium" : ""}`}
                                >
                                  {String(row.rank).padStart(2, "0")}
                                </span>
                              </td>
                              <td>
                                <strong>{row.athlete_name}</strong>
                                <small>{row.box_name ?? "Atleta libre"}</small>
                              </td>
                              <td>{row.reps}</td>
                              <td className="result-time">
                                {timeLabel(row.time_seconds)}
                              </td>
                            </tr>
                          ))
                        : leader.data.boxes.map((row) => (
                            <tr key={row.box_name}>
                              <td>
                                <span
                                  className={`rank ${row.rank <= 3 ? "podium" : ""}`}
                                >
                                  {String(row.rank).padStart(2, "0")}
                                </span>
                              </td>
                              <td>
                                <strong>{row.box_name}</strong>
                                <small>
                                  {row.box_type === "official"
                                    ? "Oficial Vector"
                                    : "Box estándar"}
                                </small>
                              </td>
                              <td>{row.athletes}</td>
                              <td className="result-time">
                                {timeLabel(row.best_seconds)}
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  icon="flag"
                  title="La primera marca puede ser la tuya"
                  description="Todavía no hay resultados validados. El ranking se actualizará cuando un juez apruebe los primeros intentos."
                  action={
                    user.role === "athlete" && selected.status === "open" ? (
                      <Button
                        className="outline"
                        onClick={() => {
                          setUpload(true);
                          mutation.clear();
                        }}
                      >
                        Subir mi intento
                        <ArrowUpRight size={16} />
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </section>
            <aside className="pose-card">
              <PoseGraphic />
              <span className="eyebrow">MOVIMIENTO CON PROPÓSITO</span>
              <h3>La técnica también cuenta.</h3>
              <p>
                Haz visible cada repetición. Sigue el estándar del reto y mantén
                el cuerpo dentro del encuadre.
              </p>
              <div>
                <CheckCircle2 size={15} />
                Vídeo sin cortes
              </div>
              <div>
                <CheckCircle2 size={15} />
                Cámara fija y luz suficiente
              </div>
              <div>
                <CheckCircle2 size={15} />
                Sin otras personas en el plano
              </div>
            </aside>
          </div>
          <section className="card submissions-card">
            <SectionTitle
              title={
                user.role === "athlete"
                  ? "Tus intentos"
                  : user.role === "box_owner"
                    ? "Intentos de tu box"
                    : "Todos los intentos"
              }
              subtitle="El estado de cada vídeo, desde la subida hasta el resultado oficial."
            />
            <Notice error={submissions.error} />
            {submissions.loading && !submissions.data ? (
              <Loading />
            ) : !activeSubmissions.length ? (
              <Empty
                title="Todavía no hay intentos"
                description={
                  user.role === "athlete"
                    ? "Graba tu primera participación y sigue aquí su análisis."
                    : "Las participaciones aparecerán aquí cuando los atletas suban sus vídeos."
                }
              />
            ) : (
              <div className="submission-list">
                {activeSubmissions.map((s) => (
                  <article className="submission-row" key={s.id}>
                    <div className="submission-symbol">
                      <Video size={22} />
                    </div>
                    <div className="submission-info">
                      <strong>
                        {s.athlete_name} <small>#{s.id}</small>
                      </strong>
                      <span>
                        {s.box_name ?? "Atleta libre"} ·{" "}
                        {dateLabel(s.created_at, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <p>
                        {s.analysis_note ??
                          (s.status === "queued"
                            ? "Esperando turno de análisis."
                            : s.status === "processing"
                              ? "Analizando la pose y el movimiento…"
                              : "Pendiente de resultado.")}
                      </p>
                    </div>
                    <div className="submission-results">
                      <Status value={s.status} />
                      {s.reps != null && (
                        <span>
                          <strong>
                            {s.reps} reps · {timeLabel(s.time_seconds)}
                          </strong>
                          {s.status !== "approved" && (
                            <small>Propuesta preliminar</small>
                          )}
                        </span>
                      )}
                      {s.confidence != null && (
                        <small>
                          Confianza de los puntos detectados:{" "}
                          {Math.round(s.confidence * 100)} %
                        </small>
                      )}
                    </div>
                    <a
                      className="icon-button"
                      href={s.video_url || `/api/submissions/${s.id}/video`}
                      target="_blank"
                      rel="noreferrer"
                      title="Ver vídeo"
                      aria-label="Ver vídeo"
                    >
                      <ArrowUpRight size={20} />
                    </a>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {upload && selected && (
        <Modal
          title="Tu siguiente marca empieza aquí"
          onClose={() => !mutation.pending && setUpload(false)}
        >
          <form className="stack-form" onSubmit={submit}>
            <div className="upload-context">
              <TrackBadge track={selected.track} />
              <span>
                {selected.target_reps} sentadillas · {selected.title}
              </span>
            </div>
            <label className={`video-dropzone ${file ? "has-file" : ""}`}>
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                required
                disabled={mutation.pending}
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  setFileError(
                    next && next.size > 100 * 1024 * 1024
                      ? "El vídeo supera los 100 MB. Reduce su tamaño antes de enviarlo."
                      : "",
                  );
                  setFile(next && next.size <= 100 * 1024 * 1024 ? next : null);
                  mutation.clear();
                }}
              />
              {file ? <FileVideo size={35} /> : <Upload size={35} />}
              <strong>{file?.name ?? "Selecciona tu vídeo"}</strong>
              <span>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                  : "MP4, MOV o WebM · máximo 100 MB"}
              </span>
              <span className="button outline">
                {file ? "Cambiar vídeo" : "Explorar archivos"}
              </span>
            </label>
            <Field label="Antes de enviar">
              <div className="upload-tips">
                <Video size={17} />
                <p>
                  Plano lateral, cámara estable y cuerpo completo. El vídeo debe
                  mostrar el inicio y el final del intento.
                </p>
              </div>
            </Field>
            <label className="checkbox-field">
              <input
                type="checkbox"
                required
                checked={consent}
                disabled={mutation.pending}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                Autorizo el tratamiento del vídeo para el análisis de pose y la
                revisión de mi participación por un juez Vector y por el
                responsable de mi box, si pertenezco a uno.
              </span>
            </label>
            {mutation.pending && (
              <div
                className="upload-progress"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div>
                  <span>
                    {progress < 100
                      ? "Subiendo vídeo…"
                      : "Preparando el análisis…"}
                  </span>
                  <strong>{progress} %</strong>
                </div>
                <div className="progress-track">
                  <i style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            <Notice
              error={fileError || mutation.error}
              success={mutation.success}
            />
            {mutation.success ? (
              <Button className="primary full" onClick={() => setUpload(false)}>
                Ver el estado de mi intento
                <ArrowRight size={17} />
              </Button>
            ) : (
              <Button
                type="submit"
                className="primary full"
                loading={mutation.pending}
                disabled={!file || !consent}
              >
                <Upload size={17} />
                Enviar intento
              </Button>
            )}
            <p className="small-print">
              <Activity size={13} />
              La IA ofrece una estimación. Tu marca será oficial tras la
              revisión humana.
            </p>
          </form>
        </Modal>
      )}
      {create && (
        <Modal title="Crear reto mensual" wide onClose={() => setCreate(false)}>
          <ChallengeForm
            onSaved={() => {
              setCreate(false);
              challenges.refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}
