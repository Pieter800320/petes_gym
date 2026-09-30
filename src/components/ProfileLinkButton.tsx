import { shareProfileLink } from './shareProfileLink'

/** Button that shares the Fitness Profile questionnaire link. */
export function ProfileLinkButton({ firstName, className = 'btn-acc' }: { firstName?: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => shareProfileLink(firstName)}>
      Fitness profile link
    </button>
  )
}
