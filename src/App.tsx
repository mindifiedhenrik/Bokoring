import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import LoginScreen from "./components/LoginScreen";

export default function App() {
  return (
    <>
      <AuthLoading><div className="boot">Laddar…</div></AuthLoading>
      <Unauthenticated><LoginScreen /></Unauthenticated>
      <Authenticated><div className="boot">Inloggad ✓ (vyer kommer i nästa steg)</div></Authenticated>
    </>
  );
}
