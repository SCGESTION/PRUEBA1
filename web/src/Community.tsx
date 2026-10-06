import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Users,
  ShieldCheck,
  Plus,
  CheckCircle2,
  ShoppingBag,
  Minus,
  Package,
  Flag,
  Info,
} from "lucide-react";
import { post, useMutation, useResource } from "./api";
import {
  Button,
  Empty,
  Field,
  Loading,
  Mark,
  Modal,
  Notice,
  PageHeading,
  SectionTitle,
  Status,
  TrackBadge,
  currency,
  dateLabel,
} from "./ui";
import { BoxForm, EventForm } from "./Forms";
import type { Box, Equipment, Rental, Track, User, VectorEvent } from "./types";
export function BoxesView({ user }: { user: User }) {
  const boxes = useResource<Box[]>("/boxes");
  const [filter, setFilter] = useState("all");
  const [create, setCreate] = useState(false);
  const visible =
    boxes.data?.filter((b) => filter === "all" || b.type === filter) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="FUERZA EN COMUNIDAD"
        title="Un movimiento. Muchos hogares."
        description="Boxes que comparten una misma dirección: avanzar juntos."
        action={
          user.role === "admin" ? (
            <Button className="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Añadir box
            </Button>
          ) : undefined
        }
      />
      <div className="community-intro">
        <div>
          <span className="eyebrow">STRONGER TOGETHER</span>
          <h2>
            Tu gente.
            <br />
            Tu lugar para crecer.
          </h2>
          <p>
            Entrenamientos diarios, retos online y competiciones presenciales.
            La misma comunidad dentro y fuera del box.
          </p>
        </div>
        <div className="community-intro-art">
          <Mark />
          <span>UNITED BY EFFORT.</span>
        </div>
      </div>
      <div className="box-benefits">
        <article>
          <ShieldCheck size={25} />
          <div>
            <h3>Box oficial Vector</h3>
            <p>
              Programación propia, retos mensuales y alquiler de material.
              Organiza competiciones presenciales bajo la marca Vector.
            </p>
          </div>
        </article>
        <article>
          <Users size={25} />
          <div>
            <h3>Box estándar</h3>
            <p>
              Programación propia, retos mensuales y alquiler de material.
              Organiza competiciones con su propia marca.
            </p>
          </div>
        </article>
      </div>
      <div className="filter-bar">
        <SectionTitle title="Encuentra tu comunidad" />
        <div className="segmented">
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            Todos
          </button>
          <button
            className={filter === "official" ? "selected" : ""}
            onClick={() => setFilter("official")}
          >
            Oficiales
          </button>
          <button
            className={filter === "standard" ? "selected" : ""}
            onClick={() => setFilter("standard")}
          >
            Estándar
          </button>
        </div>
      </div>
      <Notice error={boxes.error} />
      {boxes.loading ? (
        <Loading />
      ) : visible.length ? (
        <div className="box-grid">
          {visible.map((box, i) => (
            <article
              key={box.id}
              className={`box-card ${box.id === user.box_id ? "my-box" : ""}`}
            >
              <div className={`box-card-visual variant-${i % 3}`}>
                <Mark />
                <span>{box.city.toUpperCase()}</span>
                {box.type === "official" && (
                  <span className="official-badge">
                    <ShieldCheck size={14} />
                    OFICIAL VECTOR
                  </span>
                )}
              </div>
              <div className="box-card-body">
                <div className="box-card-title">
                  <h3>{box.name}</h3>
                  {box.id === user.box_id && <span>MI BOX</span>}
                </div>
                <p>
                  <MapPin size={15} />
                  {box.city}
                </p>
                <div className="box-card-footer">
                  <span>
                    <Users size={16} />
                    {box.athletes} atletas
                  </span>
                  <span>
                    {box.type === "official" ? "Box oficial" : "Box estándar"}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="La comunidad sigue creciendo"
          description="Los boxes aparecerán aquí cuando sean dados de alta."
        />
      )}
      {!user.box_id && user.role === "athlete" && (
        <div className="training-note">
          <Flag size={25} />
          <div>
            <strong>Eres parte de Vector, entrenes donde entrenes.</strong>
            <p>
              Como atleta libre puedes seguir la programación, participar en
              retos y encontrarte con la comunidad en eventos presenciales.
            </p>
          </div>
        </div>
      )}
      {create && (
        <Modal title="Dar de alta un box" onClose={() => setCreate(false)}>
          <BoxForm
            onSaved={() => {
              setCreate(false);
              boxes.refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function EventsView({ user }: { user: User }) {
  const events = useResource<VectorEvent[]>("/events");
  const [filter, setFilter] = useState<Track | "all">("all");
  const [create, setCreate] = useState(false);
  const mutation = useMutation();
  const visible =
    events.data?.filter(
      (e) => filter === "all" || e.track === filter || e.track === "both",
    ) ?? [];
  return (
    <>
      <PageHeading
        eyebrow="DEL BOX A LA LÍNEA DE SALIDA"
        title="Nos vemos en la arena."
        description="Competiciones de CrossFit, carreras híbridas y una comunidad que va contigo."
        action={
          user.role !== "athlete" ? (
            <Button className="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Crear competición
            </Button>
          ) : undefined
        }
      />
      <div className="events-banner">
        <div>
          <span className="eyebrow">REAL EFFORT. REAL CONNECTION.</span>
          <h2>
            Entrenas online.
            <br />
            Lo vives en persona.
          </h2>
        </div>
        <Flag size={90} strokeWidth={0.9} />
      </div>
      <div className="filter-bar">
        <SectionTitle title="En el calendario" />
        <div className="segmented">
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            Todas
          </button>
          <button
            className={filter === "forge" ? "selected forge" : ""}
            onClick={() => setFilter("forge")}
          >
            Forge
          </button>
          <button
            className={filter === "apex" ? "selected apex" : ""}
            onClick={() => setFilter("apex")}
          >
            Apex
          </button>
        </div>
      </div>
      <Notice
        error={events.error || mutation.error}
        success={mutation.success}
      />
      {events.loading ? (
        <Loading />
      ) : visible.length ? (
        <div className="event-grid">
          {visible.map((event) => (
            <article className="event-card" key={event.id}>
              <div className={`event-art ${event.track}`}>
                <div className="event-art-pattern" />
                <Mark />
                <span className="event-art-label">
                  {event.track === "forge"
                    ? "FORGED IN EFFORT"
                    : event.track === "apex"
                      ? "REACH YOUR APEX"
                      : "ONE COMMUNITY. ALL OUT."}
                </span>
                <div className="event-date-badge">
                  <strong>{dateLabel(event.date, { day: "2-digit" })}</strong>
                  <span>
                    {dateLabel(event.date, { month: "short" })
                      .replace(".", "")
                      .toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="event-body">
                <div className="event-card-top">
                  <TrackBadge track={event.track} />
                  <span className={`event-brand ${event.brand}`}>
                    {event.brand === "vector" ? (
                      <ShieldCheck size={13} />
                    ) : (
                      <Flag size={13} />
                    )}{" "}
                    {event.brand === "vector"
                      ? "OFICIAL VECTOR"
                      : "INDEPENDIENTE"}
                  </span>
                </div>
                <h3>{event.title}</h3>
                <div className="event-meta">
                  <span>
                    <MapPin size={15} />
                    {event.city}
                  </span>
                  <span>
                    <Users size={15} />
                    {event.registration_count} inscritos
                  </span>
                </div>
                <p>{event.description}</p>
                <span className="event-organizer">
                  Organiza {event.box_name ?? "Vector"}
                </span>
                {user.role === "athlete" ? (
                  <Button
                    className={
                      event.registered ? "registered full" : "primary full"
                    }
                    loading={mutation.pending}
                    disabled={event.registered}
                    onClick={() =>
                      mutation.run(
                        () => post(`/events/${event.id}/register`),
                        `Ya estás dentro de ${event.title}.`,
                        () => events.refresh(),
                      )
                    }
                  >
                    {event.registered ? (
                      <>
                        <CheckCircle2 size={17} />
                        Ya estás inscrito
                      </>
                    ) : (
                      <>
                        Quiero participar
                        <ArrowUpRight size={17} />
                      </>
                    )}
                  </Button>
                ) : (
                  (user.role === "admin" || event.box_id === user.box_id) && (
                    <Button
                      className="outline full"
                      onClick={() => {
                        location.hash = "equipment";
                      }}
                    >
                      <Package size={17} />
                      Preparar material
                      <ArrowRight size={16} />
                    </Button>
                  )
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon="flag"
          title="La siguiente salida está por anunciar"
          description="Aquí encontrarás las próximas competiciones de Vector y sus boxes."
        />
      )}
      {create && (
        <Modal
          title="Crear competición presencial"
          wide
          onClose={() => setCreate(false)}
        >
          <EventForm
            user={user}
            onSaved={() => {
              setCreate(false);
              events.refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}
function EquipmentArt({ name }: { name: string }) {
  const key = name.toLowerCase();
  const isBall = key.includes("ball") || key.includes("balón");
  const isKettle = key.includes("kettle") || key.includes("pesa");
  const isBox = key.includes("caj") || key.includes("box");
  const isSki = key.includes("ski");
  const isSled = key.includes("sled") || key.includes("trineo");
  const isRow = key.includes("remo") || key.includes("row");
  return (
    <svg viewBox="0 0 260 155" className="equipment-art" aria-hidden="true">
      <ellipse cx="130" cy="134" rx="80" ry="8" fill="#dcded3" />
      {isBall ? (
        <>
          <circle cx="130" cy="81" r="47" fill="#353935" />
          <path
            d="M130 34c-29 36-29 62 0 94m0-94c29 36 29 62 0 94M83 81h94"
            fill="none"
            stroke="#b7bd9c"
            strokeWidth="4"
          />
          <text
            x="130"
            y="86"
            textAnchor="middle"
            fill="white"
            fontSize="14"
            fontWeight="bold"
          >
            VECTOR
          </text>
        </>
      ) : isKettle ? (
        <>
          <path
            d="M113 58V41c0-21 34-21 34 0v17"
            fill="none"
            stroke="#373b37"
            strokeWidth="10"
          />
          <path
            d="M104 57c-26 19-30 52-13 68h78c17-16 13-49-13-68z"
            fill="#484d43"
          />
          <rect x="110" y="75" width="41" height="26" rx="6" fill="#b6bf99" />
          <text
            x="130"
            y="94"
            textAnchor="middle"
            fontSize="17"
            fontWeight="bold"
          >
            24
          </text>
        </>
      ) : isBox ? (
        <>
          <path d="m71 66 49-36 77 16v71l-47 20-79-26Z" fill="#a79276" />
          <path
            d="m71 66 79 15 47-35m-47 35v56"
            fill="none"
            stroke="#594b3d"
            strokeWidth="2"
          />
          <text
            x="110"
            y="107"
            textAnchor="middle"
            fill="#443b32"
            fontSize="13"
            fontWeight="bold"
            transform="rotate(11 110 107)"
          >
            VECTOR
          </text>
        </>
      ) : isSki ? (
        <>
          <path
            d="M104 128h62M131 128V37m-19 20 19-28 21 29"
            fill="none"
            stroke="#343934"
            strokeWidth="8"
          />
          <path d="m112 53-9 45m49-45 9 45" stroke="#909a7c" strokeWidth="3" />
          <rect x="119" y="75" width="25" height="28" rx="4" fill="#555b4d" />
          <circle
            cx="131"
            cy="99"
            r="18"
            fill="#a8b38c"
            stroke="#343934"
            strokeWidth="5"
          />
        </>
      ) : isRow ? (
        <>
          <path
            d="m58 127 52-32 109 27m-69 1h62"
            stroke="#3b403a"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <circle cx="79" cy="100" r="28" fill="#3b403a" />
          <circle cx="79" cy="100" r="20" fill="#b7bd9c" />
          <path d="m102 92 64-36m-6 8 16-9" stroke="#757d66" strokeWidth="4" />
          <rect x="141" y="101" width="33" height="9" rx="4" fill="#3b403a" />
        </>
      ) : isSled ? (
        <>
          <path
            d="M59 125h147M74 121V51m114 70V51m-113 0h23m90 0h-23"
            stroke="#3d4438"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path d="M128 121V56" stroke="#3d4438" strokeWidth="7" />
          <ellipse cx="128" cy="117" rx="33" ry="9" fill="#949f7e" />
          <ellipse cx="128" cy="106" rx="33" ry="9" fill="#515b46" />
        </>
      ) : (
        <>
          <path d="M38 83h184" stroke="#777e73" strokeWidth="8" />
          <rect x="52" y="41" width="17" height="84" rx="5" fill="#343934" />
          <rect x="70" y="52" width="14" height="62" rx="4" fill="#59624d" />
          <rect x="176" y="52" width="14" height="62" rx="4" fill="#59624d" />
          <rect x="191" y="41" width="17" height="84" rx="5" fill="#343934" />
          <path d="M105 83h50" stroke="#b4be98" strokeWidth="8" />
        </>
      )}
    </svg>
  );
}
export function EquipmentView({ user }: { user: User }) {
  const equipment = useResource<Equipment[]>("/equipment");
  const rentals = useResource<Rental[]>(
    user.role !== "athlete" ? "/rentals" : null,
  );
  const events = useResource<VectorEvent[]>("/events");
  const [filter, setFilter] = useState("all");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [checkout, setCheckout] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [success, setSuccess] = useState("");
  const mutation = useMutation();
  const canRent = user.role !== "athlete";
  const visible =
    equipment.data?.filter(
      (e) => filter === "all" || e.category === filter || e.category === "both",
    ) ?? [];
  const selected = equipment.data?.filter((e) => cart[e.id] > 0) ?? [];
  const totalQty = Object.values(cart).reduce((a, b) => a + b, 0);
  const days =
    start && end
      ? Math.max(
          0,
          Math.round(
            (new Date(end).getTime() - new Date(start).getTime()) / 86400000,
          ) + 1,
        )
      : 1;
  const daily = selected.reduce(
    (sum, e) => sum + e.price_per_day * cart[e.id],
    0,
  );
  const ownEvents =
    events.data?.filter(
      (e) => user.role === "admin" || e.box_id === user.box_id,
    ) ?? [];
  const update = (item: Equipment, delta: number) =>
    setCart((c) => ({
      ...c,
      [item.id]: Math.max(0, Math.min(item.stock, (c[item.id] ?? 0) + delta)),
    }));
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    mutation.run(
      () =>
        post("/rentals", {
          event_id: Number(f.get("event")),
          start_date: start,
          end_date: end,
          notes: f.get("notes"),
          items: selected.map((x) => ({
            equipment_id: x.id,
            quantity: cart[x.id],
          })),
        }),
      "Solicitud enviada.",
      () => {
        setCheckout(false);
        setCart({});
        setSuccess(
          "Solicitud de material enviada. Vector confirmará la disponibilidad.",
        );
        rentals.refresh();
      },
    );
  };
  return (
    <>
      <PageHeading
        eyebrow="PREPARA TU PRÓXIMA COMPETICIÓN"
        title="El material. A tu altura."
        description="Todo lo que necesitas para llevar el esfuerzo de tu comunidad a una nueva arena."
        action={
          canRent && totalQty > 0 ? (
            <Button
              className="primary"
              onClick={() => {
                setCheckout(true);
                mutation.clear();
              }}
            >
              <ShoppingBag size={18} />
              Mi selección<span className="button-count">{totalQty}</span>
            </Button>
          ) : undefined
        }
      />
      <div className="rental-info">
        <Package size={26} />
        <div>
          <strong>Equipamiento Vector para boxes oficiales y estándar.</strong>
          <p>
            Selecciona material de CrossFit, híbrido o ambas modalidades. La
            reserva queda confirmada tras revisar disponibilidad y fechas.
          </p>
        </div>
      </div>
      <Notice error={equipment.error} success={success} />
      {!canRent && (
        <div className="notice info">
          <Info size={18} />
          El alquiler lo gestiona el responsable de tu box. Puedes explorar el
          catálogo.
        </div>
      )}
      <div className="filter-bar">
        <SectionTitle title="Material para ir más allá" />
        <div className="segmented">
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            Todo
          </button>
          <button
            className={filter === "forge" ? "selected forge" : ""}
            onClick={() => setFilter("forge")}
          >
            CrossFit
          </button>
          <button
            className={filter === "apex" ? "selected apex" : ""}
            onClick={() => setFilter("apex")}
          >
            Híbrido
          </button>
        </div>
      </div>
      {equipment.loading ? (
        <Loading />
      ) : visible.length ? (
        <div className="equipment-grid">
          {visible.map((item) => (
            <article
              className={`equipment-card ${cart[item.id] ? "in-cart" : ""}`}
              key={item.id}
            >
              <div className="equipment-visual">
                <TrackBadge track={item.category} />
                <EquipmentArt name={`${item.name} ${item.image_key}`} />
              </div>
              <div className="equipment-body">
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <span className="equipment-stock">
                  <span className={item.stock ? "online-dot" : "offline-dot"} />
                  {item.stock} unidades en catálogo
                </span>
                <div className="equipment-footer">
                  <div>
                    <strong>{currency(item.price_per_day)}</strong>
                    <span>/ día</span>
                  </div>
                  {canRent &&
                    (cart[item.id] ? (
                      <div className="quantity-picker">
                        <button
                          onClick={() => update(item, -1)}
                          aria-label={`Quitar ${item.name}`}
                        >
                          <Minus size={14} />
                        </button>
                        <strong>{cart[item.id]}</strong>
                        <button
                          disabled={cart[item.id] >= item.stock}
                          onClick={() => update(item, 1)}
                          aria-label={`Añadir ${item.name}`}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="equipment-add"
                        disabled={!item.stock}
                        onClick={() => update(item, 1)}
                        aria-label={`Añadir ${item.name}`}
                      >
                        <Plus size={20} />
                      </button>
                    ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="El catálogo está en preparación"
          description="Pronto encontrarás aquí el material disponible para alquilar."
        />
      )}
      {canRent && (
        <section className="card rentals-section">
          <SectionTitle
            title="Tus solicitudes de material"
            subtitle="Todas las reservas y su estado de confirmación."
          />
          <Notice error={rentals.error} />
          {rentals.loading ? (
            <Loading />
          ) : rentals.data?.length ? (
            <div className="rental-list">
              {rentals.data.map((r) => (
                <article key={r.id} className="rental-row">
                  <div className="rental-row-top">
                    <div>
                      <span className="eyebrow">RESERVA #{r.id}</span>
                      <h3>{r.event_title}</h3>
                      <span className="meta">
                        <CalendarDays size={15} />
                        {dateLabel(r.start_date)} — {dateLabel(r.end_date)}
                        {r.box_name ? ` · ${r.box_name}` : ""}
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
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="El próximo evento empieza por aquí"
              description="Selecciona el material y envía tu primera solicitud de alquiler."
            />
          )}
        </section>
      )}
      {checkout && (
        <Modal title="Prepara tu arena" wide onClose={() => setCheckout(false)}>
          <form className="stack-form" onSubmit={submit}>
            <div className="checkout-items">
              {selected.map((item) => (
                <div key={item.id}>
                  <Package size={18} />
                  <strong>{item.name}</strong>
                  <span>
                    {cart[item.id]} × {currency(item.price_per_day)} / día
                  </span>
                </div>
              ))}
            </div>
            <Field
              label="Competición"
              hint="El material se vincula a uno de los eventos organizados por tu box."
            >
              <select name="event" required defaultValue="">
                <option value="" disabled>
                  Selecciona una competición
                </option>
                {ownEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {e.city}
                  </option>
                ))}
              </select>
            </Field>
            {!ownEvents.length && (
              <div className="notice info">
                <Info size={18} />
                Crea primero una competición desde la pestaña Competiciones.
              </div>
            )}
            <div className="form-grid">
              <Field label="Primer día de alquiler">
                <input
                  type="date"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="Último día de alquiler">
                <input
                  type="date"
                  min={start}
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Notas de logística">
              <textarea
                name="notes"
                rows={3}
                placeholder="Lugar de entrega, horarios o necesidades de montaje."
                maxLength={2000}
              />
            </Field>
            <div className="checkout-total">
              <span>
                {days || "—"} {days === 1 ? "día" : "días"} · {totalQty}{" "}
                unidades
              </span>
              <strong>{currency(daily * (days || 1))}</strong>
            </div>
            <Notice error={mutation.error} />
            <Button
              type="submit"
              className="primary full"
              loading={mutation.pending}
              disabled={!ownEvents.length || !days}
            >
              Solicitar reserva
              <ArrowRight size={18} />
            </Button>
            <p className="small-print">
              La solicitud no bloquea existencias. Vector confirma
              disponibilidad y reserva del material.
            </p>
          </form>
        </Modal>
      )}
    </>
  );
}
