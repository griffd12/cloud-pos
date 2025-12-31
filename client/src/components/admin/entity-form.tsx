import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { z } from "zod";

export interface FormFieldConfig {
  name: string;
  label: string;
  type: "text" | "number" | "decimal" | "textarea" | "switch" | "select" | "color" | "password";
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: any;
}

interface EntityFormProps<T extends z.ZodTypeAny> {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: z.infer<T>) => void;
  schema: T;
  fields: FormFieldConfig[];
  title: string;
  initialData?: Partial<z.infer<T>>;
  isLoading?: boolean;
  submitLabel?: string;
}

export function EntityForm<T extends z.ZodTypeAny>({
  open,
  onClose,
  onSubmit,
  schema,
  fields,
  title,
  initialData,
  isLoading = false,
  submitLabel = "Save",
}: EntityFormProps<T>) {
  const defaultValues = fields.reduce((acc, field) => {
    acc[field.name] = initialData?.[field.name] ?? field.defaultValue ?? getDefaultForType(field.type);
    return acc;
  }, {} as Record<string, any>);

  const form = useForm<z.infer<T>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as any,
  });

  // Reset form when initialData changes (e.g., when editing a different item)
  useEffect(() => {
    if (open) {
      const newValues = fields.reduce((acc, field) => {
        acc[field.name] = initialData?.[field.name] ?? field.defaultValue ?? getDefaultForType(field.type);
        return acc;
      }, {} as Record<string, any>);
      form.reset(newValues);
    }
  }, [open, initialData]);

  const handleSubmit = (data: z.infer<T>) => {
    onSubmit(data);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle data-testid="text-form-title">{title}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto -mx-6 px-6 pr-4">
              <div className="space-y-4 py-4 pr-2">
                {fields.map((fieldConfig) => (
                  <FormField
                    key={fieldConfig.name}
                    control={form.control}
                    name={fieldConfig.name as any}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>{fieldConfig.label}</FormLabel>
                          {fieldConfig.type === "switch" && (
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid={`switch-${fieldConfig.name}`}
                              />
                            </FormControl>
                          )}
                        </div>

                        {fieldConfig.type === "text" && (
                          <FormControl>
                            <Input
                              placeholder={fieldConfig.placeholder}
                              {...field}
                              value={field.value || ""}
                              data-testid={`input-${fieldConfig.name}`}
                            />
                          </FormControl>
                        )}

                        {fieldConfig.type === "password" && (
                          <FormControl>
                            <Input
                              type="password"
                              placeholder={fieldConfig.placeholder}
                              {...field}
                              value={field.value || ""}
                              data-testid={`input-${fieldConfig.name}`}
                            />
                          </FormControl>
                        )}

                        {fieldConfig.type === "number" && (
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder={fieldConfig.placeholder}
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val === "" ? null : parseFloat(val));
                              }}
                              data-testid={`input-${fieldConfig.name}`}
                            />
                          </FormControl>
                        )}

                        {fieldConfig.type === "decimal" && (
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder={fieldConfig.placeholder}
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => {
                                field.onChange(e.target.value);
                              }}
                              data-testid={`input-${fieldConfig.name}`}
                            />
                          </FormControl>
                        )}

                        {fieldConfig.type === "textarea" && (
                          <FormControl>
                            <Textarea
                              placeholder={fieldConfig.placeholder}
                              {...field}
                              value={field.value || ""}
                              data-testid={`textarea-${fieldConfig.name}`}
                            />
                          </FormControl>
                        )}

                        {fieldConfig.type === "color" && (
                          <FormControl>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={field.value || "#3B82F6"}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="w-10 h-10 rounded border cursor-pointer"
                                data-testid={`color-${fieldConfig.name}`}
                              />
                              <Input
                                placeholder="#3B82F6"
                                {...field}
                                value={field.value || ""}
                                className="flex-1"
                              />
                            </div>
                          </FormControl>
                        )}

                        {fieldConfig.type === "select" && fieldConfig.options && (
                          <Select
                            value={field.value || ""}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger data-testid={`select-${fieldConfig.name}`}>
                                <SelectValue placeholder={fieldConfig.placeholder || "Select..."} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {fieldConfig.options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {fieldConfig.description && (
                          <FormDescription>{fieldConfig.description}</FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-4 flex-shrink-0 border-t mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} data-testid="button-form-submit">
                {isLoading ? "Saving..." : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function getDefaultForType(type: FormFieldConfig["type"]): any {
  switch (type) {
    case "switch":
      return false;
    case "number":
      return null;
    default:
      return "";
  }
}
