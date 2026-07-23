import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import {
  Button,
  Form,
  FormControl,
  RhfFormField as FormField,
  FormItem,
  FormLabel,
  FormMessage,
  PasswordInput,
  Spinner,
} from '@shared/ui'

import { updatePasswordSchema, type UpdatePasswordFormValues } from '../model/schemas'
import { useUpdatePasswordMutation } from '../model/use-auth-mutations'

export function UpdatePasswordForm() {
  const updatePassword = useUpdatePasswordMutation()

  const form = useForm<UpdatePasswordFormValues>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  })

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => updatePassword.mutate(values))}
        noValidate
      >
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Новый пароль</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Повтор пароля</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={updatePassword.isPending}>
          {updatePassword.isPending ? (
            <Spinner size="sm" className="text-primary-foreground" />
          ) : null}
          Сохранить пароль
        </Button>
      </form>
    </Form>
  )
}
