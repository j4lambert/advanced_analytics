import { ToastContainer } from 'react-toastify';
import { Slide, Flip } from 'react-toastify';
import { TOAST_CONTAINER_ID, DIALOG_CONTAINER_ID } from '../hooks/toast.js';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

const CloseButton = ({ closeToast }) => (
    <span className="absolute mb-auto ml-auto right-2 shrink-0 top-2 cursor-pointer" onClick={closeToast}>
        {React.createElement(icons.X, { size: 16 })}
    </span>
);

export function ToastHost() {
    return React.createElement(React.Fragment, null,
        // Regular toasts — bottom-left, auto-dismiss
        React.createElement(ToastContainer, {
            containerId:       TOAST_CONTAINER_ID,
            position:          'bottom-left',
            className:         'aa-toast-container bottom-16 mb-5 left-2',
            toastClassName:    'mb-1',
            autoClose:         8000,
            progressClassName: 'aa-toast-progress h-0.5',
            newestOnTop:       true,
            closeOnClick:      true,
            pauseOnHover:      true,
            transition:        Slide,
            closeButton:       CloseButton,
            theme:             'dark',
        }),
        // Dialog toasts — top-center, persistent until dismissed
        React.createElement(ToastContainer, {
            containerId:  DIALOG_CONTAINER_ID,
            position:     'top-center',
            autoClose:    false,
            closeOnClick: false,
            closeButton:  CloseButton,
            draggable:    false,
            transition:   Flip,
            theme:        'dark',
            className:    'aa-dialog-container top-14',
        }),
    );
}
