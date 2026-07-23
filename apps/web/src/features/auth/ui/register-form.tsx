import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { companyLookupService, normalizeInnDigits } from '@shared/api'
import { getErrorMessage } from '@shared/lib/errors'
import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormDescription,
  RhfFormField as FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  PasswordInput,
  Spinner,
} from '@shared/ui'

import { registerSchema, type RegisterFormValues } from '../model/schemas'
import { useRegisterMutation } from '../model/use-auth-mutations'

export function RegisterForm() {
  const register = useRegisterMutation()
  const [innLookupStatus, setInnLookupStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [innLookupMessage, setInnLookupMessage] = useState<string | null>(null)
  const lookupSeq = useRef(0)
  const lastAutofilledName = useRef<string | null>(null)

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      fullName: '',
      phone: '',
      companyInnHint: '',
      companyNameHint: '',
      accepted: false,
    },
  })

  const companyInnHint = useWatch({ control: form.control, name: 'companyInnHint' })

  useEffect(() => {
    const inn = normalizeInnDigits(companyInnHint ?? '')
    if (!companyLookupService.isCompleteInn(inn)) {
      setInnLookupStatus('idle')
      setInnLookupMessage(null)
      return
    }

    const seq = ++lookupSeq.current
    const timer = window.setTimeout(() => {
      void (async () => {
        setInnLookupStatus('loading')
        setInnLookupMessage(null)
        try {
          const company = await companyLookupService.lookupByInn(inn)
          if (seq !== lookupSeq.current) return

          const currentName = form.getValues('companyNameHint')?.trim() ?? ''
          const shouldOverwrite =
            !currentName || currentName === (lastAutofilledName.current ?? '')

          if (shouldOverwrite) {
            form.setValue('companyNameHint', company.name, {
              shouldDirty: true,
              shouldValidate: true,
            })
            lastAutofilledName.current = company.name
          }

          setInnLookupStatus('ok')
          setInnLookupMessage(company.name)
        } catch (error) {
          if (seq !== lookupSeq.current) return
          setInnLookupStatus('error')
          setInnLookupMessage(
            getErrorMessage(
              error,
              'Автозаполнение недоступно. Укажите название компании вручную.',
            ),
          )
        }
      })()
    }, 450)

    return () => {
      window.clearTimeout(timer)
    }
  }, [companyInnHint, form])

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => register.mutate(values))}
        noValidate
      >
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ФИО</FormLabel>
              <FormControl>
                <Input autoComplete="name" placeholder="Иванов Иван Иванович" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Телефон</FormLabel>
              <FormControl>
                <Input type="tel" autoComplete="tel" placeholder="+7 000 000 00 00" {...field} />
              </FormControl>
              <FormDescription>Необязательно</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="companyInnHint"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ИНН организации</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="10 или 12 цифр"
                  {...field}
                  onChange={(event) => {
                    field.onChange(normalizeInnDigits(event.target.value))
                  }}
                />
              </FormControl>
              <FormDescription>
                Необязательно. По ИНН попробуем подставить название из ЕГРЮЛ — при сбое укажите вручную.
              </FormDescription>
              {innLookupStatus === 'loading' ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Spinner size="sm" />
                  Ищем организацию…
                </p>
              ) : null}
              {innLookupStatus === 'ok' && innLookupMessage ? (
                <p className="text-sm text-muted-foreground">Найдено: {innLookupMessage}</p>
              ) : null}
              {innLookupStatus === 'error' && innLookupMessage ? (
                <p className="text-sm text-destructive">{innLookupMessage}</p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="companyNameHint"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Компания</FormLabel>
              <FormControl>
                <Input
                  placeholder="Название организации"
                  {...field}
                  onChange={(event) => {
                    lastAutofilledName.current = null
                    field.onChange(event)
                  }}
                />
              </FormControl>
              <FormDescription>Подсказка для подтверждения заявки</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Пароль</FormLabel>
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

        <FormField
          control={form.control}
          name="accepted"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-3">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Принимаю условия регистрации</FormLabel>
                <FormDescription>
                  Без подтверждения зарегистрироваться нельзя.
                </FormDescription>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={register.isPending}>
          {register.isPending ? <Spinner size="sm" className="text-primary-foreground" /> : null}
          Зарегистрироваться
        </Button>
      </form>
    </Form>
  )
}
