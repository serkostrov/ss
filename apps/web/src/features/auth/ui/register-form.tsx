import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { companyLookupService, normalizeInnDigits } from '@shared/api'
import { getErrorMessage } from '@shared/lib/errors'
import { cn } from '@shared/lib/utils'
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
  Label,
  PasswordInput,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui'

import { registerSchema, type RegisterFormValues } from '../model/schemas'
import { useRegisterMutation } from '../model/use-auth-mutations'

function RequiredMark() {
  return <span className="text-destructive"> *</span>
}

const groupedFieldShellClass =
  'overflow-hidden rounded-md border border-input bg-transparent shadow-xs'
const groupedFieldTabsListClass =
  'bg-muted/40 text-muted-foreground h-8 w-full gap-0 rounded-none border-0 border-b border-input p-0.5'
const groupedFieldInputClass =
  'h-9 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0'
const groupedFieldHintClass =
  'text-muted-foreground border-t border-input px-3 py-1.5 text-xs'
const optionsGroupClass =
  'space-y-3 rounded-lg border border-input bg-muted/20 px-4 py-3 shadow-xs'

function RegisterFormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4 rounded-lg border border-input bg-muted/20 p-4 shadow-xs">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function RegisterForm() {
  const register = useRegisterMutation()
  const [companyTab, setCompanyTab] = useState<'inn' | 'name'>('inn')
  const [innLookupStatus, setInnLookupStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>(
    'idle',
  )
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
      position: '',
      phone: '',
      telegramUsername: '',
      companyInnHint: '',
      companyNameHint: '',
      accepted: false,
      showContactsToMembers: true,
      emailNotificationsEnabled: true,
    },
  })

  const companyInnHint = useWatch({ control: form.control, name: 'companyInnHint' })
  const companyNameHint = useWatch({ control: form.control, name: 'companyNameHint' })
  const showPosition = Boolean(companyInnHint?.trim() || companyNameHint?.trim())

  useEffect(() => {
    if (showPosition) return
    form.setValue('position', '', { shouldValidate: false })
    form.clearErrors('position')
  }, [showPosition, form])

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
          const shouldOverwrite = !currentName || currentName === (lastAutofilledName.current ?? '')

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
            getErrorMessage(error, 'Автозаполнение недоступно. Укажите название компании вручную.'),
          )
        }
      })()
    }, 450)

    return () => {
      window.clearTimeout(timer)
    }
  }, [companyInnHint, form])

  const companyFieldError = form.formState.errors.companyInnHint || form.formState.errors.companyNameHint

  return (
    <Form {...form}>
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit(
          (values) => register.mutate(values),
          (errors) => {
            if (errors.companyInnHint) setCompanyTab('inn')
            else if (errors.companyNameHint) setCompanyTab('name')
          },
        )}
        noValidate
      >
        <RegisterFormSection title="Личные данные" description="Контакты для связи и входа в систему">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  ФИО
                  <RequiredMark />
                </FormLabel>
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
                <FormLabel>
                  Email
                  <RequiredMark />
                </FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Телефон</FormLabel>
                  <FormControl>
                    <Input type="tel" autoComplete="tel" placeholder="+7 000 000 00 00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="telegramUsername"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username в Telegram</FormLabel>
                  <FormControl>
                    <Input placeholder="telegram_user" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </RegisterFormSection>

        <RegisterFormSection
          title="Компания"
          description="Необязательно. Укажите организацию — так заявку проще подтвердить."
        >
          <div className="space-y-2">
            <Label className={cn(companyFieldError && 'text-destructive')}>Идентификация</Label>
            <div className={groupedFieldShellClass}>
              <Tabs
                value={companyTab}
                onValueChange={(value) => setCompanyTab(value as 'inn' | 'name')}
              >
                <TabsList className={groupedFieldTabsListClass}>
                  <TabsTrigger
                    value="inn"
                    className="h-7 flex-1 rounded-sm px-2 text-xs sm:text-sm"
                  >
                    ИНН
                  </TabsTrigger>
                  <TabsTrigger
                    value="name"
                    className="h-7 flex-1 rounded-sm px-2 text-xs sm:text-sm"
                  >
                    Название
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="inn" className="mt-0">
                  <FormField
                    control={form.control}
                    name="companyInnHint"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <FormControl>
                          <Input
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="10 или 12 цифр"
                            className={groupedFieldInputClass}
                            {...field}
                            onChange={(event) => {
                              field.onChange(normalizeInnDigits(event.target.value))
                            }}
                          />
                        </FormControl>
                        {innLookupStatus === 'loading' ? (
                          <p className={cn(groupedFieldHintClass, 'flex items-center gap-1.5')}>
                            <Spinner size="sm" />
                            Ищем организацию…
                          </p>
                        ) : null}
                        {innLookupStatus === 'ok' && innLookupMessage ? (
                          <p className={groupedFieldHintClass}>Найдено: {innLookupMessage}</p>
                        ) : null}
                        {innLookupStatus === 'error' && innLookupMessage ? (
                          <p className={cn(groupedFieldHintClass, 'text-destructive')}>
                            {innLookupMessage}
                          </p>
                        ) : null}
                        <FormMessage className="px-3 pb-1.5" />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="name" className="mt-0">
                  <FormField
                    control={form.control}
                    name="companyNameHint"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <FormControl>
                          <Input
                            placeholder="Название организации"
                            className={groupedFieldInputClass}
                            {...field}
                            onChange={(event) => {
                              lastAutofilledName.current = null
                              field.onChange(event)
                            }}
                          />
                        </FormControl>
                        <FormMessage className="px-3 pb-1.5" />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {showPosition ? (
            <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Должность
                    <RequiredMark />
                  </FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="organization-title"
                      placeholder="Работник"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </RegisterFormSection>

        <RegisterFormSection title="Учётные данные" description="Пароль для входа в личный кабинет">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Пароль
                  <RequiredMark />
                </FormLabel>
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
                <FormLabel>
                  Повтор пароля
                  <RequiredMark />
                </FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </RegisterFormSection>

        <div className={optionsGroupClass}>
          <FormField
            control={form.control}
            name="showContactsToMembers"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-2.5 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    className="mt-0.5"
                  />
                </FormControl>
                <div className="min-w-0 leading-snug">
                  <FormLabel className="font-normal">Показывать контакты участникам</FormLabel>
                  <FormDescription className="text-xs">
                    Видны в справочнике ассоциации
                  </FormDescription>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="emailNotificationsEnabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-2.5 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    className="mt-0.5"
                  />
                </FormControl>
                <div className="min-w-0 leading-snug">
                  <FormLabel className="font-normal">Уведомления на email</FormLabel>
                  <FormDescription className="text-xs">
                    Счета, модерация и другие события — можно отключить позже
                  </FormDescription>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="accepted"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-2.5 space-y-0 border-t border-input pt-3">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    className="mt-0.5"
                  />
                </FormControl>
                <div className="min-w-0 leading-snug">
                  <FormLabel className="font-normal">
                    Принимаю условия регистрации
                    <RequiredMark />
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full" disabled={register.isPending}>
          {register.isPending ? <Spinner size="sm" className="text-primary-foreground" /> : null}
          Зарегистрироваться
        </Button>
      </form>
    </Form>
  )
}
