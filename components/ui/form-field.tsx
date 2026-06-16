import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type FormFieldProps = React.ComponentProps<"div"> & {
  label?: React.ReactNode
  labelClassName?: string
  htmlFor?: string
  description?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
}

function FormField({
  className,
  label,
  labelClassName,
  htmlFor,
  description,
  error,
  required,
  children,
  ...props
}: FormFieldProps) {
  return (
    <div data-slot="form-field" className={cn("grid gap-2", className)} {...props}>
      {label ? (
        <Label htmlFor={htmlFor} data-slot="form-field-label" className={labelClassName}>
          {label}
          {required ? <span className="ml-1 text-destructive">*</span> : null}
        </Label>
      ) : null}
      {children}
      {description && !error ? <FormDescription>{description}</FormDescription> : null}
      {error ? <FormMessage>{error}</FormMessage> : null}
    </div>
  )
}

function FormDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="form-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function FormMessage({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="form-message"
      className={cn("text-xs font-medium text-destructive", className)}
      {...props}
    />
  )
}

export { FormDescription, FormField, FormMessage }
