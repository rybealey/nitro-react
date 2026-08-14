import { GetCfhStatusMessageComposer } from '@nitrots/nitro-renderer';
import { FC } from 'react';
import { DispatchUiEvent, GetConfiguration, LocalizeText, ReportState, ReportType, SendMessageComposer } from '../../../api';
import { Button, Column, Text } from '../../../common';
import { GuideToolEvent } from '../../../events';
import { useHelp } from '../../../hooks';

export const HelpIndexView: FC<{}> = props =>
{
    const { setActiveReport = null } = useHelp();

    const onReportClick = () =>
    {
        // Build the whole report, not a partial one. Spreading the (null) previous
        // value left roomId undefined, and EvaWireFormat encodes undefined as a
        // 2-byte short instead of a 4-byte int — every field after it in
        // CallForHelpMessageComposer shifted, so the server read a garbage chat
        // count and threw before the ticket was ever created.
        setActiveReport({
            reportType: ReportType.BULLY,
            reportedUserId: -1,
            reportedChats: [],
            cfhCategory: -1,
            cfhTopic: -1,
            roomId: -1,
            roomName: '',
            messageId: -1,
            threadId: -1,
            groupId: -1,
            extraData: '',
            roomObjectId: -1,
            message: '',
            currentStep: ReportState.SELECT_USER
        });
    }

    return (
        <>
            <Column grow center gap={ 1 }>
                <Text fontSize={ 3 }>{ LocalizeText('help.main.frame.title') }</Text>
                <Text>{ LocalizeText('help.main.self.description') }</Text>
            </Column>
            <Column gap={ 1 }>
                <Button onClick={ onReportClick }>{ LocalizeText('help.main.bully.subtitle') }</Button>
                <Button onClick={ () => DispatchUiEvent(new GuideToolEvent(GuideToolEvent.CREATE_HELP_REQUEST)) } disabled={ !GetConfiguration('guides.enabled') }>{ LocalizeText('help.main.help.title') }</Button>
                <Button disabled={ true }>{ LocalizeText('help.main.self.tips.title') }</Button>
            </Column>
            <Button variant="link" textColor="black" onClick={ () => SendMessageComposer(new GetCfhStatusMessageComposer(false)) }>{ LocalizeText('help.main.my.sanction.status') }</Button>
        </>
    )
}
