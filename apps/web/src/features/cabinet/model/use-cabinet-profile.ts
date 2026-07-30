import { authService, queryKeys, useSupabaseMutation, type AuthProfile } from '@shared/api'
import { notify } from '@shared/lib/notify'

import type { MemberProfileFormValues } from './member-profile-schema'

export function toMemberProfileFormValues(
  profile: AuthProfile | null | undefined,
): MemberProfileFormValues {
  return {
    fullName: profile?.fullName ?? '',
    position: profile?.position ?? '',
    phone: profile?.phone ?? '',
    telegramUsername: profile?.telegramUsername ?? '',
    maxUsername: profile?.maxUsername ?? '',
    showContactsToMembers: profile?.showContactsToMembers ?? false,
  }
}

export function useUpdateOwnMemberProfileMutation() {
  return useSupabaseMutation(
    (values: MemberProfileFormValues) =>
      authService.updateOwnMemberProfile({
        fullName: values.fullName,
        position: values.position || null,
        phone: values.phone || null,
        telegramUsername: values.telegramUsername.replace(/^@+/, '') || null,
        maxUsername: values.maxUsername.replace(/^@+/, '') || null,
        showContactsToMembers: values.showContactsToMembers,
      }),
    {
      ensureFreshSession: true,
      invalidateKeys: [queryKeys.auth.all, queryKeys.representatives.all, queryKeys.directory.all],
      onSuccess: () => notify.success('Профиль сохранён'),
      onError: (error) => notify.fromError(error, 'Не удалось сохранить профиль'),
    },
  )
}
