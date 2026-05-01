"use client";

type StepHeaderProps = {
  title: string;
};

/** Primary heading for the active checkout step (step counts live in the progress header). */
export function StepHeader({ title }: StepHeaderProps) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[1.75rem] sm:leading-snug">
        {title}
      </h1>
    </div>
  );
}
