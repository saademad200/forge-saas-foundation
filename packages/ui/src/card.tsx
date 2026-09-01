import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

export function Card({ title, description, children, className, ...props }: CardProps) {
  return (
    <div className={cn("forge-card", className)} {...props}>
      {title !== undefined && <h3 className="forge-card__title">{title}</h3>}
      {description !== undefined && <p className="forge-card__desc">{description}</p>}
      {children}
    </div>
  );
}
