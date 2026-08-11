"use client";
export default function ErrorState({reset}:{reset:()=>void}){return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Organic revenue data could not load. <button className="font-semibold underline" onClick={reset}>Try again</button></div>;}
