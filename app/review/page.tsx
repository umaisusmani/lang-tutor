import { redirect } from 'next/navigation';

/** Reviewing moved onto /vocab ("Start session"); this keeps old links alive. */
export default function ReviewPage() {
  redirect('/vocab');
}
