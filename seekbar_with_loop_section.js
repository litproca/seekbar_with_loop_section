'use strict';

//------------------------------------------------
//--- Spider Monkey Panel script 
//
// File:    seekbar_with_loop_section.js
// Author:  litproca
// Version: 1.0
// Purpose: Seekbar with loop section shown for tracks with loop tags/metadata/points.
//          The supported tags are LOOPSTART/LOOPLENGTH/LOOPEND and Loop_Start/Loop_Length/Loop_End, case insensitive.
//          Integer values are treated as samples and decimals with a decimal point are treated as seconds.
//          The loop start tag must be present, and if loop length and end cannot be found, the end of the track is used as the loop end.
//
//  History:  
//  1.0     litproca    Initial release
//  base    marc2003    Code base
//
//  Discussion: https://hydrogenaud.io/index.php/topic,127522.0.html
//------------------------------------------------

window.DefineScript('Seekbar', { author: 'litproca', options: { grab_focus: false } });
include(fb.ComponentPath + 'samples\\complete\\js\\lodash.min.js');
include(fb.ComponentPath + 'samples\\complete\\js\\helpers.js');
include(fb.ComponentPath + 'samples\\complete\\js\\seekbar.js');

let g_loop_info = {};
g_loop_info.is_valid = false;

on_playback_new_track(fb.GetNowPlaying());

const bar_offset_y = 13;
const slider_offset_y = 6;
const slider_offset_x = 5;
const slider_width = 17;

let seekbar = new _seekbar(slider_offset_x, 0, 0, 0);

seekbar.c_bg = _RGB(255, 255, 255);
seekbar.c_bar = _RGB(231, 234, 234);
seekbar.c_slider = _RGB(0, 122, 217);
seekbar.c_loop_section = _RGB(128, 128, 128);

function on_size() {
    seekbar.w = window.Width - slider_width;
    seekbar.h = window.Height;
}

function on_paint(gr) {
    gr.FillSolidRect(seekbar.x, seekbar.y, seekbar.w, seekbar.h, seekbar.c_bg);
    gr.FillSolidRect(seekbar.x, seekbar.y + bar_offset_y, seekbar.w, seekbar.h - bar_offset_y * 2, seekbar.c_bar);
    if (fb.PlaybackLength <= 0) {
        return;
    }

    if (g_loop_info.is_valid) {
        if (g_loop_info.end_time != -1) {
            gr.FillSolidRect(
                seekbar.x + Math.ceil(seekbar.w * g_loop_info.start_time / fb.PlaybackLength), seekbar.y + bar_offset_y,
                Math.ceil(seekbar.w * (g_loop_info.end_time - g_loop_info.start_time) / fb.PlaybackLength), seekbar.h - bar_offset_y * 2, seekbar.c_loop_section
            );
        } else {
            gr.FillSolidRect(
                seekbar.x + Math.ceil(seekbar.w * g_loop_info.start_time / fb.PlaybackLength), seekbar.y + bar_offset_y,
                Math.ceil(seekbar.w * (fb.PlaybackLength - g_loop_info.start_time) / fb.PlaybackLength), seekbar.h - bar_offset_y * 2, seekbar.c_loop_section
            );
        }
    }

    if (fb.IsPlaying) {
        //gr.FillSolidRect(seekbar.x, seekbar.y, seekbar.pos(), seekbar.h, seekbar.c2);
        gr.FillSolidRect(seekbar.x + Math.min(seekbar.pos(), seekbar.w) - slider_offset_x, seekbar.y + slider_offset_y, slider_width, seekbar.h - slider_offset_y * 2, seekbar.c_slider);
    }
}

function get_loop_meta(file_info, loop_meta) {
    /*loop_meta = {
        start_str: "",
        length_str: "",
        end_str: ""
    }*/
    let start_index = -1;
    let length_index = -1;
    let end_index = -1;

    let found_count = 0;
    for (let i = 0; i < file_info.MetaCount; ++i) {
        if (found_count >= 2) { break; }

        let meta_name = file_info.MetaName(i).toUpperCase();
        if (meta_name.startsWith("LOOP")) {
            if (meta_name.charAt(4) === '_') {
                meta_name = meta_name.substring(5);
            } else {
                meta_name = meta_name.substring(4);
            }

            if (start_index == -1 && meta_name === "START") {
                start_index = i;
                if (file_info.MetaValueCount(i) != 0) {
                    loop_meta.start_str = file_info.MetaValue(i, 0);
                }
                found_count += 1;
                continue;
            }

            if (length_index == -1 && end_index == -1) {
                if (meta_name === "LENGTH") {
                    length_index = i;
                    if (file_info.MetaValueCount(i) != 0) {
                        loop_meta.length_str = file_info.MetaValue(i, 0);
                    }
                    found_count += 1;
                    continue;
                } else if (meta_name === "END") {
                    end_index = i;
                    if (file_info.MetaValueCount(i) != 0) {
                        loop_meta.end_str = file_info.MetaValue(i, 0);
                    }
                    found_count += 1;
                    continue;
                }
            }
        }
    }
    /*
    console.log("loop_meta.start_str: ", loop_meta.start_str);
    console.log("loop_meta.length_str: ", loop_meta.length_str);
    console.log("loop_meta.end_str:", loop_meta.end_str);
    */
}

function time_to_samples(time, sample_rate) {
    return Math.round(time * sample_rate);
}

function samples_to_time(samples, sample_rate) {
    return samples / sample_rate;
}

function get_loop_info(file_info, loop_info) {
    loop_info.is_valid = false;
    let index = file_info.InfoFind("samplerate");
    if (index == -1) {
        loop_info.srate = 0;
        return;
    }
    let srate = parseInt(file_info.InfoValue(index), 10);
    loop_info.srate = srate;

    let loop_meta = {
        start_str: "",
        length_str: "",
        end_str: ""
    }
    get_loop_meta(file_info, loop_meta);

    let start = 0;
    let end = 0;
    let start_time = 0.0;
    let end_time = 0.0;
    let is_double = false;
    let is_only_start_found = false;
    let valid = false;

    for (; ;) {
        if (loop_meta.start_str === "") { break; }
        let is_start_double = loop_meta.start_str.includes('.');
        if (loop_meta.end_str !== "") {
            if (is_start_double || loop_meta.end_str.includes('.')) {
                is_double = true;
                start_time = parseFloat(loop_meta.start_str);
                end_time = parseFloat(loop_meta.end_str);
                if (start_time >= end_time) { break; }
            } else {
                start = parseInt(loop_meta.start_str, 10);
                end = parseInt(loop_meta.end_str, 10);
                if (start >= end) { break; }
            }
        } else if (loop_meta.length_str !== "") {
            if (is_start_double || loop_meta.length_str.includes('.')) {
                is_double = true;
                start_time = parseFloat(loop_meta.start_str);
                let length_time = parseFloat(loop_meta.length_str);
                end_time = start_time + length_time;
                if (length_time <= 0) { break; }
            } else {
                start = parseInt(loop_meta.start_str, 10);
                let length = parseInt(loop_meta.length_str, 10);
                end = start + length;
                if (length == 0) { break; }
            }
        } else {
            // loop end not found
            is_only_start_found = true;
            if (is_start_double) {
                is_double = true;
                start_time = parseFloat(loop_meta.start_str);
            } else {
                start = parseInt(loop_meta.start_str, 10);
            }
        }
        valid = true;
        break;
    }

    if (!valid) { return; }

    if (is_only_start_found) {
        if (is_double) {
            // loop_info.start = time_to_samples(start_time, srate);
            loop_info.start_time = start_time;
        }
        else {
            // loop_info.start = start;
            loop_info.start_time = samples_to_time(start, srate);
        }
        // loop_info.end = -1;
        loop_info.end_time = -1;
    } else if (is_double) {
        // loop_info.start = time_to_samples(start_time, srate);
        // loop_info.end = time_to_samples(end_time, srate);
        loop_info.start_time = start_time;
        loop_info.end_time = end_time;
    } else {
        // loop_info.start = start;
        // loop_info.end = end;
        loop_info.start_time = samples_to_time(start, srate);
        loop_info.end_time = samples_to_time(end, srate);
    }

    loop_info.is_valid = true;
    /*
    console.log(loop_info.is_valid, "\t", loop_info.srate);
    console.log(loop_info.start, "\t", loop_info.start_time);
    console.log(loop_info.end, "\t", loop_info.end_time); 
    */
}

function on_playback_new_track(handle) {
    if (handle == null) {
        g_loop_info.is_valid = false;
        return;
    }

    let file_info = handle.GetFileInfo();
    if (file_info) {
        get_loop_info(file_info, g_loop_info);
    } else {
        g_loop_info.is_valid = false;
    }
}

function on_playback_seek() {
    seekbar.playback_seek();
}

function on_playback_stop() {
    seekbar.playback_stop();
}

function on_mouse_wheel(s) {
    seekbar.wheel(s);
}

function on_mouse_move(x, y) {
    seekbar.move(x, y);
}

function on_mouse_lbtn_down(x, y) {
    seekbar.lbtn_down(x, y);
}

function on_mouse_lbtn_up(x, y) {
    seekbar.lbtn_up(x, y);
}
