export type Track = "forge" | "apex";
export type Role = "admin" | "box_owner" | "athlete";
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  box_id: number | null;
  box_name: string | null;
  box_type: "official" | "standard" | null;
}
export interface Box {
  id: number;
  name: string;
  city: string;
  type: "official" | "standard";
  athletes: number;
}
export interface Bootstrap {
  demo: boolean;
  user: User | null;
  tracks: { id: Track; name: string; description: string }[];
  boxes: Box[];
}
export interface Workout {
  id: number;
  title: string;
  track: Track;
  scope: "vector" | "box";
  box_id: number | null;
  box_name: string | null;
  scheduled_date: string;
  format: "for_time" | "amrap" | "emom" | "strength";
  duration_minutes: number;
  level: "all" | "scaled" | "rx";
  notes: string;
  exercises: { movement: string; reps: number; load_kg: number | null }[];
  author_name: string;
}
export interface Challenge {
  id: number;
  title: string;
  track: Track;
  movement: "squat";
  target_reps: number;
  opens_at: string;
  closes_at: string;
  description: string;
  box_count: number;
  submission_count: number;
  enrolled: boolean;
  status: "upcoming" | "open" | "closed";
}
export interface Submission {
  id: number;
  challenge_id: number;
  challenge_title: string;
  athlete_name: string;
  box_name: string | null;
  status:
    "queued" | "processing" | "review" | "approved" | "rejected" | "failed";
  reps: number | null;
  time_seconds: number | null;
  confidence: number | null;
  analysis_note: string | null;
  video_url: string;
  created_at: string;
}
export interface Leaderboard {
  athletes: {
    rank: number;
    athlete_name: string;
    box_name: string | null;
    box_type: string | null;
    time_seconds: number;
    reps: number;
    submission_id: number;
  }[];
  boxes: {
    rank: number;
    box_name: string;
    box_type: string;
    athletes: number;
    best_seconds: number;
  }[];
}
export interface VectorEvent {
  id: number;
  title: string;
  track: Track | "both";
  city: string;
  date: string;
  brand: "vector" | "independent";
  box_id: number | null;
  box_name: string | null;
  description: string;
  registration_count: number;
  registered: boolean;
}
export interface Equipment {
  id: number;
  name: string;
  category: Track | "both";
  stock: number;
  price_per_day: number;
  image_key: string;
  description: string;
}
export interface Rental {
  id: number;
  event_id: number;
  event_title: string;
  box_name: string | null;
  start_date: string;
  end_date: string;
  status: "pending" | "confirmed" | "declined";
  total: number;
  notes: string;
  items: {
    equipment_id: number;
    name: string;
    quantity: number;
    price_per_day: number;
  }[];
}
export interface Dashboard {
  stats: { label: string; value: string | number; detail: string }[];
  activity: {
    id: number;
    kind: string;
    title: string;
    detail: string;
    date: string;
  }[];
  weekly_activity: { day: string; forge: number; apex: number }[];
  challenge: Challenge | null;
  my_submissions: Submission[];
  box: Box | null;
}
export interface Overview {
  users: number;
  boxes: number;
  official_boxes: number;
  pending_rentals: number;
  pending_reviews: number;
  ai: { available: boolean; detail: string };
  users_list: User[];
}
