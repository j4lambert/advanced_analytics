import { toast } from 'react-toastify';
import { Flip } from 'react-toastify';

export const TOAST_CONTAINER_ID  = 'aa-toasts';
export const DIALOG_CONTAINER_ID = 'aa-dialogs';

export function notify(message, options = {}) {
    return toast(message, { containerId: TOAST_CONTAINER_ID, ...options });
}

export function notifyDialog(content, options = {}) {
    return toast(content, {
        containerId: DIALOG_CONTAINER_ID,
        autoClose:   false,
        transition:  Flip,
        ...options,
    });
}
