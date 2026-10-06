import { useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  Users,
  Flame,
  MoveUpRight,
} from "lucide-react";
import { post, useMutation } from "./api";
import { Button, Field, Mark, Notice } from "./ui";
import type { Bootstrap, User } from "./types";
export default function Auth({
  bootstrap,
  onLogin,
}: {
  bootstrap: Bootstrap;
  onLogin: (user: User) => void;
}) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [box, setBox] = useState("");
  const mutation = useMutation();
  const login = (
    e?: React.FormEvent,
    emailOverride?: string,
    passwordOverride?: string,
  ) => {
    e?.preventDefault();
    mutation.run(
      () =>
        post<User>(
          register && !emailOverride ? "/auth/register" : "/auth/login",
          register && !emailOverride
            ? { name, email, password, box_id: box ? Number(box) : null }
            : {
                email: emailOverride ?? email,
                password: passwordOverride ?? password,
              },
        ),
      "Sesión iniciada.",
      onLogin,
    );
  };
  return (
    <div className="auth-page">
      <div className="auth-story">
        <div className="auth-brand">
          <Mark />
          <span>
            VECTOR<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="auth-story-main">
          <span className="eyebrow">THE NEXT YOU</span>
          <h1>
            NO HAY
            <br />
            LÍMITES.
            <br />
            <span>
              HAY UN
              <br />
              SIGUIENTE.
            </span>
          </h1>
          <p>
            Entrena con propósito. Compite con tu comunidad.
            <br />
            Descubre de lo que eres capaz.
          </p>
          <div className="auth-tracks">
            <span>
              <Flame size={18} /> FORGE / CROSSFIT
            </span>
            <span>
              <MoveUpRight size={18} /> APEX / HYBRID
            </span>
          </div>
        </div>
        <div className="auth-story-bottom">
          <span>UNA COMUNIDAD. DOS CAMINOS.</span>
          <span>EST. 2026</span>
        </div>
        <div className="auth-decoration" />
      </div>
      <div className="auth-panel">
        <span className="eyebrow">BIENVENIDO AL MOVIMIENTO</span>
        <h2>{register ? "Tu primera repetición." : "Nos vemos dentro."}</h2>
        <p>
          {register
            ? "Crea tu perfil de atleta y empieza a construir tu siguiente versión."
            : "Tu entrenamiento, tu box y tu próximo reto, en un solo lugar."}
        </p>
        <form onSubmit={login} className="auth-form">
          {register && (
            <Field label="Nombre completo">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={80}
                minLength={2}
              />
            </Field>
          )}
          <Field label="Correo electrónico">
            <input
              type="email"
              placeholder="tú@ejemplo.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
          <Field
            label="Contraseña"
            hint={register ? "Mínimo 10 caracteres." : ""}
          >
            <input
              type="password"
              placeholder="Tu contraseña"
              minLength={register ? 10 : 1}
              maxLength={128}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </Field>
          {register && (
            <Field label="Tu comunidad">
              <select value={box} onChange={(e) => setBox(e.target.value)}>
                <option value="">Atleta libre — sin box</option>
                {bootstrap.boxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.city}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Notice error={mutation.error} />
          <Button
            type="submit"
            className="primary full"
            loading={mutation.pending}
          >
            {register ? "Crear mi cuenta" : "Entrar en Vector"}
            <ArrowRight size={18} />
          </Button>
        </form>
        <div className="auth-toggle">
          {register ? "¿Ya formas parte de Vector?" : "¿Es tu primera vez?"}{" "}
          <button
            onClick={() => {
              setRegister(!register);
              mutation.clear();
            }}
          >
            {register ? "Inicia sesión" : "Crea tu cuenta"}
          </button>
        </div>
        {bootstrap.demo && (
          <div className="demo-box">
            <div className="demo-title">
              <ShieldCheck size={17} />
              <strong>Explora la demo</strong>
              <span>Datos de ejemplo</span>
            </div>
            <p>
              Elige un perfil para probar su experiencia con una sesión real.
            </p>
            <div className="demo-accounts">
              {[
                {
                  email: "atleta@vector.local",
                  name: "Atleta de box",
                  icon: Flame,
                },
                {
                  email: "libre@vector.local",
                  name: "Atleta libre",
                  icon: Users,
                },
                {
                  email: "forge@vector.local",
                  name: "Box oficial",
                  icon: ShieldCheck,
                },
                {
                  email: "norte@vector.local",
                  name: "Box estándar",
                  icon: Users,
                },
                {
                  email: "admin@vector.local",
                  name: "Administrador",
                  icon: ShieldCheck,
                },
              ].map((a) => (
                <button
                  key={a.email}
                  disabled={mutation.pending}
                  onClick={() => login(undefined, a.email, "VectorDemo2026!")}
                >
                  <a.icon size={15} />
                  {a.name}
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="auth-footer">FORGED BY EFFORT. UNITED BY VECTOR.</div>
      </div>
    </div>
  );
}
