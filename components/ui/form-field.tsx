import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type FormFieldProps = React.ComponentProps<"div"> & {
  label?: React.ReactNode
  labelClassName?: string
  /**
   * The id of the input this field controls. Used to wire:
   *   - <label htmlFor>
   *   - <input aria-describedby="{id}-description" | "{id}-message">
   *   - <input aria-invalid={Boolean(error)}>
   */
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
  const descriptionId = htmlFor ? `${htmlFor}-description` : undefined;
  const messageId = htmlFor ? `${htmlFor}-message` : undefined;
  const descriptionContext = description ? descriptionId : undefined;
  const messageContext = error ? messageId : descriptionContext;
  return (
    <div data-slot="form-field" className={cn("grid gap-2", className)} {...props}>
      {label ? (
        <Label htmlFor={htmlFor} data-slot="form-field-label" className={labelClassName}>
          {label}
          {required ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
        </Label>
      ) : null}
      {/*
        Augment children with a11y wiring. Consumers should spread these props onto
        their <input> / <textarea> / shadcn Input so that screen readers receive
        aria-invalid, aria-describedby, and aria-required correctly.
      */}
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: htmlFor ?? (children.props as { id?: string }).id,
            "aria-invalid": error ? true : (children.props as { "aria-invalid"?: boolean })["aria-invalid"],
            "aria-describedby": messageContext ?? descriptionContext,
            "aria-required": required ? true : undefined,
          })
        : children}
      {description && !error ? (
        <FormDescription id={descriptionId}>{description}</FormDescription>
      ) : null}
      {error ? (
        <FormMessage id={messageId} role="alert" aria-live="polite">
          {error}
        </FormMessage>
      ) : null}
    </div>
  )
}

function FormDescription({
  className,
  id,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      id={id}
      data-slot="form-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function FormMessage({
  className,
  id,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      id={id}
      data-slot="form-message"
      className={cn("text-xs font-medium text-destructive", className)}
      {...props}
    />
  )
}

export { FormDescription, FormField, FormMessage }
