"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";

export default function Root() {
  const router = useRouter();
  useEffect(() => {
    router.replace(auth.isLoggedIn() ? "/dashboard" : "/login");
  }, [router]);
  return null;
}
