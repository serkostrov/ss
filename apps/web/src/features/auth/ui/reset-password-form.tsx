import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import {
  Alert,
  AlertDescription,
  Button,
  Form,
  FormControl,
  RhfFormField as FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Spinner,
} from '@shared/ui'

import { resetPasswordSchema, type ResetPasswordFormValues } from '../model/schemas'
import { useResetPasswordMutation } from '../model/use-auth-mutations'

export function ResetPasswordForm() {
  const reset = useResetPasswordMutation()

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: '' },
  })

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => reset.mutate(values))}
        noValidate
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="name@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {reset.isSuccess ? (
          <Alert>
            <AlertDescription>
              Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля.
            </AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="w-full" disabled={reset.isPending}>
          {reset.isPending ? <Spinner size="sm" className="text-primary-foreground" /> : null}
          Отправить ссылку
        </Button>
      </form>
    </Form>
  )
}
