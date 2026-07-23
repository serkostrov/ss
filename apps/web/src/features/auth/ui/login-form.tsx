import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { routes } from '@shared/config'
import {
  Button,
  Form,
  FormControl,
  RhfFormField as FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  PasswordInput,
  Spinner,
} from '@shared/ui'

import { loginSchema, type LoginFormValues } from '../model/schemas'
import { useLoginMutation } from '../model/use-auth-mutations'

export function LoginForm() {
  const login = useLoginMutation()

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
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

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-2">
                <FormLabel>Пароль</FormLabel>
                <Link
                  to={routes.resetPassword}
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  Забыли пароль?
                </Link>
              </div>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? <Spinner size="sm" className="text-primary-foreground" /> : null}
          Войти
        </Button>
      </form>
    </Form>
  )
}
