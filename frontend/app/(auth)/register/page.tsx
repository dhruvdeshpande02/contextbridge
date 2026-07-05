"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register, login } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmallBrainIcon, BridgeLogo } from "@/components/brain-illustration";

function FloatingLogo({ size, x, y, delay, opacity }: { size: number; x: string; y: string; delay: string; opacity: number }) {
  return (
    <div className="absolute animate-float pointer-events-none select-none"
      style={{ left: x, top: y, animationDelay: delay, opacity, width: size, color: "#4f7ef8" }}>
      <SmallBrainIcon className="w-full h-auto" />
    </div>
  );
}

function NeuralCanvas() {
  const nodes = [
    { x: 60,  y: 80  }, { x: 180, y: 40  }, { x: 300, y: 120 },
    { x: 140, y: 200 }, { x: 260, y: 260 }, { x: 80,  y: 340 },
    { x: 320, y: 380 }, { x: 200, y: 440 }, { x: 60,  y: 480 },
    { x: 350, y: 160 }, { x: 30,  y: 220 }, { x: 230, y: 320 },
    { x: 160, y: 520 }, { x: 310, y: 500 }, { x: 100, y: 140 },
  ];
  const edges = [
    [0,1],[1,2],[0,3],[3,4],[4,5],[2,9],[3,10],[4,11],
    [5,7],[6,7],[7,8],[6,11],[11,12],[12,13],[1,14],[14,3],
  ];
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 380 580" preserveAspectRatio="xMidYMid slice">
      {edges.map(([a, b], i) => (
        <line key={i}
          x1={nodes[a].x} y1={nodes[a].y}
          x2={nodes[b].x} y2={nodes[b].y}
          stroke="rgba(79,126,248,0.12)" strokeWidth="1"
        />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={i % 3 === 0 ? 5 : 3}
          fill="#4f7ef8" opacity="0.35"
          className="animate-pulse-glow" style={{ animationDelay: `${(i * 0.25) % 2}s` }} />
      ))}
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await register(email, password);
      const token = await login(email, password);
      auth.setToken(token.access_token);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen overflow-hidden">

      {/* Left — branding panel (desktop only) */}
      <div className="relative hidden md:flex w-full md:w-1/2 flex-col items-center justify-center px-6 md:px-16 overflow-hidden"
        style={{ borderRight: "1px solid rgba(255,255,255,0.04)" }}>

        <NeuralCanvas />

        {[
          { size: 200, x: "-8%",  y: "5%",  delay: "0s"   },
          { size: 120, x: "60%",  y: "2%",  delay: "1.3s" },
          { size: 160, x: "5%",   y: "62%", delay: "2.1s" },
          { size: 90,  x: "62%",  y: "68%", delay: "0.7s" },
        ].map((r, i) => (
          <div key={i} className="absolute rounded-full animate-float pointer-events-none"
            style={{ left: r.x, top: r.y, width: r.size, height: r.size,
              border: "1px solid rgba(79,126,248,0.1)", animationDelay: r.delay }} />
        ))}

        <FloatingLogo size={38} x="10%"  y="18%"  delay="0s"    opacity={0.2}  />
        <FloatingLogo size={26} x="66%"  y="14%"  delay="1.2s"  opacity={0.15} />
        <FloatingLogo size={32} x="68%"  y="62%"  delay="0.6s"  opacity={0.15} />
        <FloatingLogo size={22} x="18%"  y="70%"  delay="1.9s"  opacity={0.13} />
        <FloatingLogo size={18} x="55%"  y="82%"  delay="0.9s"  opacity={0.10} />

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="mb-6" style={{ color: "#4f7ef8", width: 80 }}>
            <BridgeLogo className="w-full h-auto" />
          </div>
          <h1 className="text-4xl font-bold text-ink tracking-tight">ContextBridge</h1>
          <p className="mt-3 text-base text-muted max-w-xs leading-relaxed">
            Your meetings, understood.<br />Decisions, actions, and gaps — surfaced automatically.
          </p>
        </div>
      </div>

      {/* Right — register form with ambient animation */}
      <div className="relative flex w-full md:w-1/2 flex-col items-center justify-center px-6 md:px-16 py-12 md:py-0 overflow-hidden">

        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 380 580" preserveAspectRatio="xMidYMid slice">
          {[[320,60],[180,140],[60,220],[300,300],[140,400],[260,480],[80,520],[340,180]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r={i%2===0?4:2.5} fill="#4f7ef8" opacity="0.12"
              className="animate-pulse-glow" style={{ animationDelay:`${(i*0.3)%2}s` }} />
          ))}
          {[[320,60,180,140],[180,140,60,220],[60,220,300,300],[300,300,140,400],[140,400,260,480],[260,480,80,520],[80,520,340,180]].map(([x1,y1,x2,y2],i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(79,126,248,0.07)" strokeWidth="1" />
          ))}
        </svg>

        {[
          { size: 180, x: "55%", y: "3%",  delay: "0.8s" },
          { size: 110, x: "-5%", y: "8%",  delay: "1.8s" },
          { size: 140, x: "60%", y: "65%", delay: "0.3s" },
          { size: 80,  x: "5%",  y: "72%", delay: "1.5s" },
        ].map((r, i) => (
          <div key={i} className="absolute rounded-full animate-float pointer-events-none"
            style={{ left: r.x, top: r.y, width: r.size, height: r.size,
              border: "1px solid rgba(79,126,248,0.07)", animationDelay: r.delay }} />
        ))}

        <div className="relative z-10 w-full max-w-sm animate-slide-up">
          {/* Compact branding — mobile only */}
          <div className="md:hidden flex flex-col items-center text-center mb-8">
            <div className="mb-3" style={{ color: "#4f7ef8", width: 44 }}>
              <BridgeLogo className="w-full h-auto" />
            </div>
            <h1 className="text-xl font-bold text-ink tracking-tight">ContextBridge</h1>
          </div>

          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-6">Create Account</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            {error && (
              <p className="rounded-lg px-3 py-2 text-xs text-red-400"
                style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} className="w-full">
              {loading ? "Creating account..." : "Get started"}
            </Button>
          </form>
          <p className="mt-5 text-xs text-muted">
            Already have an account?{" "}
            <Link href="/login" className="text-subtle hover:text-ink underline underline-offset-2 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
