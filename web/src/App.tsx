import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Dumbbell,
  Trophy,
  Users,
  Flag,
  Package,
  SlidersHorizontal,
  LogOut,
  ChevronRight,
  Menu,
  X,
  ArrowUpRight,
  Search,
  CalendarDays,
} from "lucide-react";
import { api, post, useResource } from "./api";
import { Button, Loading, Mark, Notice, dateLabel } from "./ui";
import type { Bootstrap, User } from "./types";
import Auth from "./Auth";
import DashboardView from "./Dashboard";
import WorkoutsView from "./Workouts";
import ChallengesView from "./Challenges";
import { BoxesView, EventsView, EquipmentView } from "./Community";
import AdminView from "./Admin";
export type View =
  | "dashboard"
  | "workouts"
  | "challenge"
  | "boxes"
  | "events"
  | "equipment"
  | "admin";
const links = [
  { id: "dashboard", label: "Mi dashboard", icon: LayoutDashboard },
  { id: "workouts", label: "Entrenamientos", icon: Dumbbell },
  { id: "challenge", label: "Reto mensual", icon: Trophy },
  { id: "boxes", label: "Comunidad", icon: Users },
  { id: "events", label: "Competiciones", icon: Flag },
  { id: "equipment", label: "Material", icon: Package },
];
const roles = {
  admin: "Administrador",
  box_owner: "Responsable de box",
  athlete: "Atleta Vector",
};
export default function App() {
  const boot = useResource<Bootstrap>("/bootstrap");
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>(
    (location.hash.slice(1) || "dashboard") as View,
  );
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    if (boot.data) setUser(boot.data.user);
  }, [boot.data]);
  useEffect(() => {
    const handler = () =>
      setView((location.hash.slice(1) || "dashboard") as View);
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  const navigate = (next: View) => {
    setView(next);
    location.hash = next;
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const logout = async () => {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await post("/auth/logout");
      setUser(null);
      navigate("dashboard");
      boot.refresh();
    } catch (e) {
      setLogoutError(
        e instanceof Error ? e.message : "No se pudo cerrar la sesión.",
      );
    } finally {
      setLoggingOut(false);
    }
  };
  if (boot.loading && !boot.data)
    return (
      <div className="boot-state">
        <Mark />
        <Loading />
      </div>
    );
  if (!boot.data)
    return (
      <div className="boot-state">
        <Mark />
        <h2>Conectando con Vector</h2>
        <Notice error={boot.error} />
        <Button onClick={boot.refresh}>Reintentar conexión</Button>
      </div>
    );
  if (!user)
    return (
      <Auth
        bootstrap={boot.data}
        onLogin={(u) => {
          setUser(u);
          navigate("dashboard");
        }}
      />
    );
  const validView =
    links.some((l) => l.id === view) ||
    (view === "admin" && user.role === "admin")
      ? view
      : "dashboard";
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-overlay" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <button
          className="sidebar-brand"
          onClick={() => navigate("dashboard")}
          aria-label="Vector, inicio"
        >
          <Mark />
          <span>
            VECTOR<span className="brand-dot">.</span>
          </span>
        </button>
        <span className="sidebar-label">TU UNIVERSO</span>
        <nav>
          {links.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-link ${validView === id ? "active" : ""}`}
              onClick={() => navigate(id as View)}
              key={id}
            >
              <Icon size={19} />
              <span>{label}</span>
              {validView === id && <span className="nav-active-dot" />}
            </button>
          ))}
          {user.role === "admin" && (
            <>
              <div className="nav-divider" />
              <button
                className={`nav-link ${validView === "admin" ? "active" : ""}`}
                onClick={() => navigate("admin")}
              >
                <SlidersHorizontal size={19} />
                <span>Administración</span>
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-manifesto">
            <span>BETTER.</span>
            <span>STRONGER.</span>
            <span>
              TOGETHER<em>.</em>
            </span>
            <ArrowUpRight size={27} />
          </div>
          <div className="sidebar-user">
            <div className="avatar">
              {user.name
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")}
            </div>
            <div>
              <strong>{user.name}</strong>
              <span>{roles[user.role]}</span>
            </div>
            <button
              className="icon-button logout"
              onClick={logout}
              disabled={loggingOut}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setMobile(!mobile)}
            aria-label="Abrir menú"
          >
            {mobile ? <X /> : <Menu />}
          </button>
          <div className="breadcrumb">
            Tu universo <ChevronRight size={13} />
            <strong>
              {validView === "admin"
                ? "Administración"
                : links.find((l) => l.id === validView)?.label}
            </strong>
          </div>
          <form
            className="top-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate("workouts");
            }}
          >
            <Search size={16} />
            <input
              aria-label="Buscar entrenamientos"
              placeholder="Busca tu próximo entrenamiento"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <span className="topbar-date">
            <CalendarDays size={16} />
            {dateLabel(new Date().toISOString(), {
              day: "numeric",
              month: "long",
            })}
          </span>
          <div className="topbar-avatar avatar">{user.name[0]}</div>
        </header>
        <main>
          <Notice error={logoutError} />
          {validView === "dashboard" && (
            <DashboardView user={user} navigate={navigate} />
          )}{" "}
          {validView === "workouts" && (
            <WorkoutsView user={user} search={search} />
          )}{" "}
          {validView === "challenge" && <ChallengesView user={user} />}{" "}
          {validView === "boxes" && <BoxesView user={user} />}{" "}
          {validView === "events" && <EventsView user={user} />}{" "}
          {validView === "equipment" && <EquipmentView user={user} />}{" "}
          {validView === "admin" && <AdminView user={user} />}
          <footer className="main-footer">
            <span>
              © {new Date().getFullYear()} Vector. Construye tu siguiente
              versión.
            </span>
            <span>
              FORGE YOURSELF. REACH YOUR APEX.
              <Mark />
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
export { api };
